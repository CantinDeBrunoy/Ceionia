import * as THREE from 'three';
import { World, N, VR, VS, SEA, VEG_VOLCANO, VEG_FOREST, VEG_FIELD, VEG_GARDEN } from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { Puffs } from './particles';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Lac retenu dans un creux du relief : niveau de l'eau, sous-sommets noyés, sommet par où il déborde */
interface Lake { level: number; cells: number[]; outlet: number }
/** Pied d'une cascade : les embruns y montent en continu */
interface Spray { x: number; y: number; z: number; k: number }

const MAX_TORRENTS = (n: number) => Math.round(n / 16);
const LAKE_SHALLOW = new THREE.Color(0x7fc8cf), LAKE_DEEP = new THREE.Color(0x2f6f93);
const MIST = new THREE.Color(0xf4f8fa);

/**
 * Eaux de montagne : lacs dans les creux d'altitude (le relief affiché est « rempli » jusqu'à son point de débordement)
 * et torrents qui descendent des sommets jusqu'à un lac ou la mer, en cascades écumantes sur les à-pics ;
 * tout se recalcule quand le relief change
 */
export class Streams {
  group = new THREE.Group();
  private lakeMesh: THREE.Mesh;
  private flowMesh: THREE.Mesh;
  /** passerelles de bois là où un torrent croise une route */
  private bridgeMesh: THREE.Mesh;
  private paths: [number, number][][] = [];
  private roadsVersion = -1;
  private sprays: Spray[] = [];
  /** points le long des torrents (x, z, raideur), pour le son de l'eau vive */
  private samples: number[] = [];
  private puffs = new Puffs(160, 0);
  private uTime = { value: 0 };
  /** densité des embruns (qualité graphique) */
  density = 1;
  private uFrozen = { value: 0 };
  private uIce = { value: 0 };
  private built = -1;
  private job: Generator<void, void, unknown> | null = null;
  private wait = 0;
  private col = new THREE.Color();
  /** Relief « rempli » : chaque creux monté jusqu'à son débordement (toute pente y mène à la mer ou à un bord) */
  private filled = new Float32Array(0);
  lakes: Lake[] = [];

  constructor(private world: World, waterNormal: THREE.Texture | null) {
    const lakeMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.12, metalness: 0, depthWrite: false, normalMap: waterNormal, normalScale: new THREE.Vector2(0.3, 0.3) });
    lakeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uIce = this.uIce;
      sh.fragmentShader = 'uniform float uIce;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  // gelés l'hiver : glace bleutée presque opaque
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.93, 0.97), uIce * 0.85);
  diffuseColor.a = mix(diffuseColor.a, 0.96, uIce);`);
    };
    lakeMat.customProgramCacheKey = () => 'lake';
    this.lakeMesh = new THREE.Mesh(new THREE.BufferGeometry(), lakeMat);
    this.lakeMesh.renderOrder = 2;
    this.lakeMesh.receiveShadow = true;
    this.flowMesh = new THREE.Mesh(new THREE.BufferGeometry(), torrentMaterial(this.uTime, this.uFrozen));
    this.flowMesh.renderOrder = 2;
    this.bridgeMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x9a7452, flatShading: true, roughness: 0.9 }));
    this.bridgeMesh.castShadow = true;
    this.bridgeMesh.receiveShadow = true;
    this.group.add(this.lakeMesh, this.flowMesh, this.bridgeMesh, this.puffs.mesh);
  }

  /** Proximité du torrent et de la cascade les plus proches (0 loin … 1 tout près) ; rien quand tout est gelé */
  nearness(focus: THREE.Vector3): [number, number] {
    if (this.uFrozen.value > 0.6) return [0, 0];
    let ds = Infinity, dc = Infinity;
    const s = this.samples;
    for (let i = 0; i < s.length; i += 3) {
      const d = Math.hypot(s[i] - focus.x, s[i + 1] - focus.z);
      ds = Math.min(ds, d);
      if (s[i + 2] > 1.1) dc = Math.min(dc, d);
    }
    for (const sp of this.sprays) dc = Math.min(dc, Math.hypot(sp.x - focus.x, sp.z - focus.z));
    return [1 - smoothstep(1.5, 12, ds), 1 - smoothstep(2, 16, dc)];
  }

  /** @param snow neige de saison (0 … 1) : lacs gelés et torrents figés l'hiver */
  update(dt: number, snow: number, focus: THREE.Vector3) {
    const w = this.world;
    this.uTime.value += dt;
    this.uIce.value += (smoothstep(0.45, 0.85, snow) - this.uIce.value) * Math.min(1, dt * 0.5);
    this.uFrozen.value = this.uIce.value;
    // le relief vient de changer : on attend qu'il se stabilise (sculpture en cours), puis on recalcule par petits bouts,
    // quelques millisecondes par image (au chargement, d'un coup)
    if (w.visVersion !== this.built) {
      this.job = null;
      this.wait -= dt;
      if (this.built < 0) { this.built = w.visVersion; this.rebuild(); }
      else if (this.wait <= 0) { this.built = w.visVersion; this.wait = 0.8; this.job = this.steps(); }
    } else this.wait = 0.8;
    if (this.job) {
      const end = performance.now() + 4;
      while (performance.now() < end) if (this.job.next().done) { this.job = null; break; }
    }
    // une route posée ou retirée : les passerelles suivent
    if (w.version !== this.roadsVersion) { this.roadsVersion = w.version; this.buildBridges(); }
    // embruns au pied des cascades proches (rien quand elles sont gelées)
    if (this.uFrozen.value < 0.5) {
      for (const s of this.sprays) {
        if (Math.abs(s.x - focus.x) > 45 || Math.abs(s.z - focus.z) > 45 || Math.random() > dt * 3 * s.k * this.density) continue;
        this.puffs.spawn(s.x + (Math.random() - 0.5) * 0.3, s.y + 0.1, s.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3,
          0.22 + Math.random() * 0.15, 1.4 + Math.random() * 0.8, MIST, 0, { grow: 2.2, drag: 0.6, wind: 0.08, alpha: 0.42 });
      }
    }
    this.puffs.update(dt);
  }

  /** Recalcul complet, d'un coup */
  rebuild() { for (const step of this.steps()) void step; }

  /** Recalcul des lacs et des torrents, découpé en étapes (générateur) */
  private *steps() {
    const w = this.world, vis = w.vis;
    // ---- lacs : remplissage des creux depuis la mer, les bords, les ravins et les cratères (qui ne retiennent pas d'eau)
    const filled = Float32Array.from(vis), closed = new Uint8Array(VS * VS), heap = new MinHeap(VS * 4);
    const seed = (i: number) => { if (!closed[i]) { closed[i] = 1; heap.push(i, vis[i]); } };
    for (let i = 0; i < VS; i++) { seed(i); seed((VS - 1) * VS + i); seed(i * VS); seed(i * VS + VS - 1); }
    for (let i = 0; i < VS * VS; i++) if (vis[i] <= SEA + 0.02 || w.ravine[i] > 0.02) seed(i);
    for (let k = 0; k < N * N; k++) {
      if (w.veg[k] !== VEG_VOLCANO) continue;
      const cx = (k % N) + 0.5, cz = Math.floor(k / N) + 0.5;
      for (let z = Math.max(0, Math.floor((cz - 5) * VR)); z <= Math.min(VS - 1, Math.ceil((cz + 5) * VR)); z++)
        for (let x = Math.max(0, Math.floor((cx - 5) * VR)); x <= Math.min(VS - 1, Math.ceil((cx + 5) * VR)); x++)
          if (Math.hypot(x / VR - cx, z / VR - cz) < 5) seed(z * VS + x);
    }
    this.filled = filled;
    yield;
    let pops = 0;
    while (heap.size) {
      if (++pops % 25000 === 0) yield;
      const i = heap.pop(), h = filled[i], x = i % VS;
      for (const j of [x > 0 ? i - 1 : -1, x < VS - 1 ? i + 1 : -1, i - VS, i + VS]) {
        if (j < 0 || j >= VS * VS || closed[j]) continue;
        closed[j] = 1;
        filled[j] = Math.max(vis[j], h);
        heap.push(j, filled[j]);
      }
    }
    // creux remplis : un lac s'ils sont assez grands et profonds, en hauteur, et sans bâtiment ni route au fond
    const inLake = new Int32Array(VS * VS).fill(-1);
    let lakes: Lake[] = [];
    for (let i = 0; i < VS * VS; i++) {
      if (i % 30000 === 0) yield;
      if (inLake[i] !== -1 || filled[i] - vis[i] < 0.03) continue;
      const cells: number[] = [i], level = filled[i];
      inLake[i] = -2;
      let deep = 0, blocked = false, trees = 0;
      for (let q = 0; q < cells.length; q++) {
        const c = cells[q], x = c % VS;
        deep = Math.max(deep, level - vis[c]);
        const k = Math.min(N - 1, Math.floor(c / VS / VR)) * N + Math.min(N - 1, Math.floor(x / VR));
        // pas d'eau sur un bâtiment, une route, un champ ; une cuvette boisée reste un vallon (pas d'arbres noyés)
        if (w.occ[k] || w.veg[k] === VEG_FIELD || w.veg[k] === VEG_GARDEN) blocked = true;
        if (w.veg[k] === VEG_FOREST) trees++;
        for (const j of [x > 0 ? c - 1 : -1, x < VS - 1 ? c + 1 : -1, c - VS, c + VS])
          if (j >= 0 && j < VS * VS && inLake[j] === -1 && filled[j] - vis[j] >= 0.03) { inLake[j] = -2; cells.push(j); }
      }
      if (blocked || trees > cells.length * 0.04 || cells.length < 16 || deep < 0.35 || level < 2.5) continue;
      // déversoir : là où le plan d'eau trouve une pente pour s'écouler
      const way = this.flatPath(cells[0]), outlet = way ? way[way.length - 1] : -1;
      for (const c of cells) inLake[c] = lakes.length;
      lakes.push({ level, cells, outlet });
    }
    // pas une carte criblée de mares : les plus grands et les plus profonds d'abord
    const keep = Math.round(N / 8);
    if (lakes.length > keep) {
      const score = (l: Lake) => Math.sqrt(l.cells.length) * Math.max(...l.cells.map((c) => l.level - vis[c]));
      lakes = [...lakes].sort((a, b) => score(b) - score(a)).slice(0, keep);
      inLake.fill(-1);
      lakes.forEach((l, li) => { for (const c of l.cells) inLake[c] = li; });
    }
    yield;
    this.lakes = lakes;
    this.buildLakes(inLake);
    // le monde apprend où sont les lacs : on n'y bâtit pas, on les contourne, on y pêche
    const cells = new Uint8Array(N * N), level = new Float32Array(N * N);
    for (const l of this.lakes)
      for (const c of l.cells) {
        const x = c % VS, z = (c / VS) | 0;
        if (x % VR !== 1 || z % VR !== 1) continue;
        const k = ((z - 1) / VR) * N + (x - 1) / VR;
        cells[k] = 1; level[k] = l.level;
      }
    w.setLakes(cells, level);

    // ---- torrents : des déversoirs des lacs, puis des sommets les plus hauts, espacés ; ils suivent la plus grande pente
    const volcanoes: [number, number, number][] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) { const f = w.volcanoFrame(k % N, Math.floor(k / N)); volcanoes.push([f.x, f.z, f.r]); }
    const starts: number[] = this.lakes.map((l) => l.outlet).filter((o) => o >= 0);
    /** lac d'où part chaque torrent (déversoir), -1 pour une source de montagne */
    const from = new Map(this.lakes.map((l, li) => [l.outlet, li]));
    const cand: number[] = [];
    let top = 0;
    for (let i = 0; i < VS * VS; i++) top = Math.max(top, vis[i]);
    const minH = Math.max(2.4, top * 0.5);
    for (let z = 4; z < VS - 4; z += 2)
      for (let x = 4; x < VS - 4; x += 2) {
        const i = z * VS + x;
        if (vis[i] < minH || inLake[i] >= 0) continue;
        if (volcanoes.some(([vx, vz, r]) => Math.hypot(x / VR - vx, z / VR - vz) < r + 1)) continue;
        cand.push(i);
      }
    // plus haut d'abord, avec un peu de hasard (stable pour une carte donnée)
    cand.sort((a, b) => vis[b] + hash2(b % VS, b / VS | 0, 31) * 2 - (vis[a] + hash2(a % VS, a / VS | 0, 31) * 2));
    const far = (i: number) => starts.every((s) => Math.hypot((s % VS - i % VS) / VR, ((s / VS | 0) - (i / VS | 0)) / VR) > 9);
    for (const i of cand) { if (starts.length >= MAX_TORRENTS(N) + this.lakes.length) break; if (far(i)) starts.push(i); }
    yield;
    const geos: THREE.BufferGeometry[] = [], sprays: Spray[] = [], samples: number[] = [], paths: [number, number][][] = [];
    for (const [si, s] of starts.entries()) {
      const path = this.trace(s, inLake, from.get(s) ?? -1);
      if (path) { geos.push(this.ribbon(path, sprays, samples)); paths.push(path); }
      if (si % 3 === 2) yield;
    }
    this.sprays = sprays; this.samples = samples; this.paths = paths;
    this.flowMesh.geometry.dispose();
    this.flowMesh.geometry = geos.length ? mergeRibbons(geos) : new THREE.BufferGeometry();
    this.buildBridges();
    for (const g of geos) g.dispose();
  }

  /** Passerelles de planches avec garde-corps, en travers du courant, là où un torrent croise une route */
  private buildBridges() {
    const w = this.world, geos: THREE.BufferGeometry[] = [], seen = new Set<number>();
    for (const p of this.paths)
      for (let i = 1; i < p.length - 1; i++) {
        const [px, pz] = p[i], k = Math.floor(pz) * N + Math.floor(px);
        if (!w.road[k] || seen.has(k) || w.isWet(k % N, Math.floor(k / N))) continue;
        seen.add(k);
        const tx = p[i + 1][0] - p[i - 1][0], tz = p[i + 1][1] - p[i - 1][1], tl = Math.hypot(tx, tz) || 1;
        const a = Math.atan2(-tx / tl, -tz / tl), y = w.hAt(px, pz) + 0.09;
        for (const [bx, by, bz, oy, oz] of [[0.9, 0.05, 0.42, 0, 0], [0.9, 0.025, 0.025, 0.11, 0.19], [0.9, 0.025, 0.025, 0.11, -0.19]])
          geos.push(new THREE.BoxGeometry(bx, by, bz).translate(0, oy, oz).rotateY(a).translate(px, y, pz));
      }
    this.bridgeMesh.geometry.dispose();
    this.bridgeMesh.geometry = geos.length ? mergeGeometries(geos)! : new THREE.BufferGeometry();
    for (const g of geos) g.dispose();
  }

  /** Traversée d'un replat du relief rempli : plus court chemin (largeur d'abord) jusqu'à un sommet d'où l'on redescend */
  private flatPath(start: number): number[] | null {
    const f = this.filled, lv = f[start], prev = new Map<number, number>([[start, -1]]), queue = [start];
    for (let q = 0; q < queue.length && q < 4000; q++) {
      const i = queue[q], x = i % VS;
      for (const j of [x > 0 ? i - 1 : -1, x < VS - 1 ? i + 1 : -1, i - VS, i + VS]) {
        if (j < 0 || j >= VS * VS || prev.has(j)) continue;
        if (f[j] < lv - 1e-4) {
          const path = [j];
          for (let v = i; v >= 0; v = prev.get(v)!) path.push(v);
          return path.reverse();
        }
        if (f[j] <= lv + 1e-4) { prev.set(j, i); queue.push(j); }
      }
    }
    return null;
  }

  /** Nappe de chaque lac : un carré par sous-case dont un coin est noyé, au niveau de l'eau, teinté selon la profondeur */
  private buildLakes(inLake: Int32Array) {
    const w = this.world, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (const [li, l] of this.lakes.entries()) {
      const seen = new Set<number>();
      for (const c of l.cells) {
        const x = c % VS, z = (c / VS) | 0;
        for (const [qx, qz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
          if (qx < 0 || qz < 0 || qx >= VS - 1 || qz >= VS - 1 || seen.has(qz * VS + qx)) continue;
          seen.add(qz * VS + qx);
          const base = pos.length / 3;
          for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const v = (qz + dz) * VS + qx + dx, depth = inLake[v] === li ? l.level - w.vis[v] : 0;
            pos.push((qx + dx) / VR, l.level + 0.015, (qz + dz) / VR);
            this.col.copy(LAKE_SHALLOW).lerp(LAKE_DEEP, smoothstep(0, 1.4, depth));
            col.push(this.col.r, this.col.g, this.col.b, 0.55 + 0.35 * smoothstep(0, 1, depth));
          }
          idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => (i % 3 === 1 ? [] : [v * 0.18])), 2));
    g.setIndex(idx);
    this.lakeMesh.geometry.dispose();
    this.lakeMesh.geometry = g;
  }

  /** Chemin d'un torrent : plus grande pente (8 voisins) jusqu'à la mer, un lac, un creux ou un bâtiment ; lissé ensuite */
  private trace(start: number, inLake: Int32Array, own: number): [number, number][] | null {
    const w = this.world, vis = w.vis, pts: [number, number][] = [];
    let i = start, steps = 0;
    while (steps++ < VS) {
      const x = i % VS, z = (i / VS) | 0;
      pts.push([x / VR, z / VR]);
      if (vis[i] <= SEA + 0.02 || (inLake[i] >= 0 && inLake[i] !== own) || w.ravine[i] > 0.3) break;
      const k = Math.min(N - 1, Math.floor(z / VR)) * N + Math.min(N - 1, Math.floor(x / VR));
      if (w.occ[k]) { pts.pop(); break; }
      // plus grande pente du relief rempli ; sur un replat (petite cuvette sans lac), on le traverse jusqu'à sa sortie
      const f = this.filled;
      let best = -1, bd = 1e-5;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= VS || nz >= VS) continue;
          const j = nz * VS + nx, drop = (f[i] - f[j]) / Math.hypot(dx, dz);
          // le torrent qui sort d'un lac n'y retombe pas
          if (drop > bd && (own < 0 || inLake[j] !== own)) { bd = drop; best = j; }
        }
      if (best < 0) {
        const way = this.flatPath(i);
        if (!way || way.length < 2) break;
        for (const v of way.slice(1, -1)) pts.push([(v % VS) / VR, ((v / VS) | 0) / VR]);
        best = way[way.length - 1];
      }
      i = best;
    }
    // trop court, ou perdu dans un creux sans eau
    const end = pts[pts.length - 1];
    if (pts.length < 10 || (w.hAt(end[0], end[1]) > SEA + 0.05 && inLake[i] < 0 && pts.length < 24)) return null;
    // lissage (Chaikin) puis rééchantillonnage régulier
    let p = pts;
    for (let it = 0; it < 2; it++) {
      const q: [number, number][] = [p[0]];
      for (let a = 0; a < p.length - 1; a++) {
        const [x0, z0] = p[a], [x1, z1] = p[a + 1];
        q.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]);
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    const out: [number, number][] = [p[0]];
    let acc = 0;
    for (let a = 1; a < p.length; a++) {
      acc += Math.hypot(p[a][0] - p[a - 1][0], p[a][1] - p[a - 1][1]);
      if (acc >= 0.25) { out.push(p[a]); acc = 0; }
    }
    return out;
  }

  /** Ruban drapé sur le relief, qui s'élargit vers l'aval ; écume et embruns là où il plonge */
  private ribbon(pts: [number, number][], sprays: Spray[], samples: number[]) {
    const w = this.world, n = pts.length;
    const pos = new Float32Array(n * 9), along = new Float32Array(n * 3), side = new Float32Array(n * 3), steep = new Float32Array(n * 3);
    let dist = 0, fall = 0;
    for (let i = 0; i < n; i++) {
      const [px, pz] = pts[i], [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(n - 1, i + 1)];
      if (i > 0) dist += Math.hypot(px - ax, pz - az);
      const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1;
      const slope = (w.hAt(ax, az) - w.hAt(bx, bz)) / tl, hw = 0.1 + 0.16 * Math.min(1, dist / 22);
      // fin d'une chute : des embruns montent du bassin
      if (slope > 1.1) fall += slope * tl * 0.5;
      else if (fall > 0.6) { sprays.push({ x: px, y: w.hAt(px, pz), z: pz, k: Math.min(3, fall) }); fall = 0; } else fall = 0;
      if (i % 3 === 0) samples.push(px, pz, slope);
      for (let j = 0; j < 3; j++) {
        const o = (j - 1) * hw, vx = px - (tz / tl) * o, vz = pz + (tx / tl) * o, k = i * 3 + j;
        pos[k * 3] = vx; pos[k * 3 + 1] = w.hAt(vx, vz) + 0.035 + Math.min(0.06, slope * 0.02); pos[k * 3 + 2] = vz;
        along[k] = dist; side[k] = j - 1; steep[k] = smoothstep(0.5, 1.6, slope);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < 2; j++) { const a = i * 3 + j; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aSteep', new THREE.BufferAttribute(steep, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Assemble les rubans (mêmes attributs) en une seule géométrie */
function mergeRibbons(list: THREE.BufferGeometry[]) {
  const names = ['position', 'normal', 'aAlong', 'aSide', 'aSteep'];
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index!.count; }
  const out = new THREE.BufferGeometry(), idx = new Uint32Array(ni);
  for (const name of names) {
    const size = list[0].attributes[name].itemSize, arr = new Float32Array(nv * size);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  let vo = 0, io = 0;
  for (const g of list) {
    const src = g.index!.array;
    for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo;
    vo += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Eau vive : stries qui filent vers l'aval, écume blanche dans les chutes, bords transparents ; figée et blanchie l'hiver */
function torrentMaterial(uTime: { value: number }, uFrozen: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime, uFrozen });
    sh.vertexShader = 'attribute float aAlong;\nattribute float aSide;\nattribute float aSteep;\nvarying float vAlong;\nvarying float vSide;\nvarying float vSteep;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlong = aAlong; vSide = aSide; vSteep = aSteep;');
    sh.fragmentShader = 'uniform float uTime;\nuniform float uFrozen;\nvarying float vAlong;\nvarying float vSide;\nvarying float vSteep;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float t = uTime * (1.0 - uFrozen);
  float streak = smoothstep(0.55, 0.95, sin(vAlong * 5.0 - t * (5.0 + vSteep * 9.0) + sin(vSide * 4.0 + vAlong * 1.7) * 1.3) * 0.5 + 0.5);
  float foam = clamp(vSteep * 0.85 + streak * (0.25 + vSteep * 0.5), 0.0, 1.0);
  vec3 water = mix(vec3(0.33, 0.62, 0.74), vec3(0.95, 0.98, 1.0), foam);
  diffuseColor.rgb = mix(water, vec3(0.88, 0.94, 0.98), uFrozen * 0.8);
  diffuseColor.a = (0.72 + foam * 0.25) * (1.0 - smoothstep(0.65, 1.0, abs(vSide)));`);
  };
  m.customProgramCacheKey = () => 'torrent';
  return m;
}

/** Tas binaire (priorité = hauteur) pour le remplissage des creux */
class MinHeap {
  private idx: Int32Array;
  private pri: Float32Array;
  size = 0;
  constructor(cap: number) { this.idx = new Int32Array(cap); this.pri = new Float32Array(cap); }
  push(i: number, p: number) {
    if (this.size === this.idx.length) {
      const ni = new Int32Array(this.size * 2), np = new Float32Array(this.size * 2);
      ni.set(this.idx); np.set(this.pri); this.idx = ni; this.pri = np;
    }
    let c = this.size++;
    while (c > 0) {
      const par = (c - 1) >> 1;
      if (this.pri[par] <= p) break;
      this.idx[c] = this.idx[par]; this.pri[c] = this.pri[par]; c = par;
    }
    this.idx[c] = i; this.pri[c] = p;
  }
  pop() {
    const top = this.idx[0], li = this.idx[--this.size], lp = this.pri[this.size];
    let c = 0;
    for (;;) {
      let m = c * 2 + 1;
      if (m >= this.size) break;
      if (m + 1 < this.size && this.pri[m + 1] < this.pri[m]) m++;
      if (this.pri[m] >= lp) break;
      this.idx[c] = this.idx[m]; this.pri[c] = this.pri[m]; c = m;
    }
    this.idx[c] = li; this.pri[c] = lp;
    return top;
  }
}
