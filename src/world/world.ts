import { Building, KINDS, KindId } from '../build/catalog';

export const N = 48;
export const SEA = 0;
export const MAX_H = 9;
export const MIN_H = -2.4;
/** Relief affiché : VR sous-sommets par case, lissé (la grille de jeu reste N×N) */
export const VR = 2;
export const VS = N * VR + 1;
const VIS_PASSES = 3;

export interface Snapshot {
  heights: Float32Array;
  road: Uint8Array;
  veg: Uint8Array;
  buildings: Building[];
  nextId: number;
}

export interface WorldListener {
  onAdd(b: Building, animate: boolean): void;
  onRemove(b: Building): void;
  onChange(b: Building): void;
  onReset(): void;
}

/** Vegetation: 0 rien, 1 forêt, 2 champ, 3 jardin ; décors sans effet sur la simulation : 4 rocaille, 5 entrée de grotte, 6 épave, 7 cratère de volcan */
export const VEG_FOREST = 1, VEG_FIELD = 2, VEG_GARDEN = 3, VEG_ROCKS = 4, VEG_CAVE = 5, VEG_WRECK = 6, VEG_VOLCANO = 7;
/** Taille de l'ouverture des grottes (rayon et hauteur de l'arche, profondeur du tunnel), partagée par le relief qui s'y creuse */
export const CAVE = { r: 0.3, h: 0.36, depth: 0.75 };

export class World {
  readonly n = N;
  mapId = 0;
  seed = 1;
  heights = new Float32Array((N + 1) * (N + 1));
  occ = new Int32Array(N * N);
  road = new Uint8Array(N * N);
  veg = new Uint8Array(N * N);
  buildings = new Map<number, Building>();
  nextId = 1;
  terrainDirty = true;
  roadsDirty = true;
  vegDirty = true;
  /** Incrémenté à chaque modification structurelle (pour la simulation) */
  version = 0;
  listeners: WorldListener[] = [];
  /** Hauteurs affichées (grille VS×VS) : relief adouci, emprises des bâtiments gardées à plat */
  vis = new Float32Array(VS * VS);
  private visTmp = new Float32Array(VS * VS);
  private visUp = new Float32Array(VS * VS);
  private visPin = new Uint8Array(VS * VS);

  vi(x: number, z: number) { return z * (N + 1) + x; }
  ci(x: number, z: number) { return z * N + x; }
  inCells(x: number, z: number) { return x >= 0 && z >= 0 && x < N && z < N; }
  h(x: number, z: number) { return this.heights[this.vi(x, z)]; }

  cellCorners(cx: number, cz: number): [number, number, number, number] {
    return [this.h(cx, cz), this.h(cx + 1, cz), this.h(cx, cz + 1), this.h(cx + 1, cz + 1)];
  }
  cellAvg(cx: number, cz: number) {
    const c = this.cellCorners(cx, cz);
    return (c[0] + c[1] + c[2] + c[3]) / 4;
  }
  cellMin(cx: number, cz: number) { return Math.min(...this.cellCorners(cx, cz)); }
  cellSlope(cx: number, cz: number) {
    const c = this.cellCorners(cx, cz);
    return Math.max(...c) - Math.min(...c);
  }

  /** Hauteur affichée exacte (mêmes triangles que le maillage du relief) */
  hAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), N - 1e-4) * VR, z = Math.min(Math.max(wz, 0), N - 1e-4) * VR;
    const cx = Math.floor(x), cz = Math.floor(z);
    const u = x - cx, v = z - cz;
    const i = cz * VS + cx, vis = this.vis;
    const h00 = vis[i], h10 = vis[i + 1], h01 = vis[i + VS], h11 = vis[i + VS + 1];
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
  }

  /** Repère d'une entrée de grotte : pied de l'ouverture au centre de la case, tournée vers l'aval (cap = atan2(dx, dz)) */
  caveFrame(cx: number, cz: number) {
    const x = cx + 0.5, z = cz + 0.5, e = 0.35;
    const gx = this.hAt(x + e, z) - this.hAt(x - e, z), gz = this.hAt(x, z + e) - this.hAt(x, z - e);
    return { x, y: this.hAt(x, z), z, yaw: Math.atan2(-gx, -gz) };
  }

  /** Recalcule le relief affiché : suréchantillonnage puis flou binomial, sauf sous les bâtiments ; sommets et falaises gardent leurs arêtes */
  updateVis() {
    const vis = this.vis, tmp = this.visTmp, pin = this.visPin;
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const ix = Math.min(N - 1, Math.floor(x / VR)), iz = Math.min(N - 1, Math.floor(z / VR));
        const u = x / VR - ix, v = z / VR - iz;
        const a = this.h(ix, iz) + (this.h(ix + 1, iz) - this.h(ix, iz)) * u;
        const b = this.h(ix, iz + 1) + (this.h(ix + 1, iz + 1) - this.h(ix, iz + 1)) * u;
        vis[z * VS + x] = a + (b - a) * v;
      }
    this.visUp.set(vis);
    pin.fill(0);
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        if (!this.occ[this.ci(cx, cz)]) continue;
        for (let z = cz * VR; z <= (cz + 1) * VR; z++) for (let x = cx * VR; x <= (cx + 1) * VR; x++) pin[z * VS + x] = 1;
      }
    for (let pass = 0; pass < VIS_PASSES; pass++) {
      tmp.set(vis);
      for (let z = 0; z < VS; z++)
        for (let x = 0; x < VS; x++) {
          const i = z * VS + x;
          if (pin[i]) continue;
          const xl = x > 0 ? i - 1 : i, xr = x < VS - 1 ? i + 1 : i;
          const zu = z > 0 ? -VS : 0, zd = z < VS - 1 ? VS : 0;
          vis[i] = (4 * tmp[i] + 2 * (tmp[xl] + tmp[xr] + tmp[i + zu] + tmp[i + zd])
            + tmp[xl + zu] + tmp[xr + zu] + tmp[xl + zd] + tmp[xr + zd]) / 16;
        }
    }
    // le lissage s'estompe en altitude (crêtes franches) et au bord des à-pics (falaises verticales)
    const up = this.visUp;
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x;
        if (pin[i]) continue;
        let drop = 0;
        if (x > 0) drop = Math.max(drop, Math.abs(up[i] - up[i - 1]));
        if (x < VS - 1) drop = Math.max(drop, Math.abs(up[i] - up[i + 1]));
        if (z > 0) drop = Math.max(drop, Math.abs(up[i] - up[i - VS]));
        if (z < VS - 1) drop = Math.max(drop, Math.abs(up[i] - up[i + VS]));
        const a = Math.min(1, Math.max(0, (up[i] - 3) / 3)), c = Math.min(1, Math.max(0, (drop - 0.35) / 0.35));
        const k = Math.max(a * a * (3 - 2 * a) * 0.7, c * c * (3 - 2 * c) * 0.9);
        if (k > 0) vis[i] += (up[i] - vis[i]) * k;
      }
  }

  isWaterCell(cx: number, cz: number) { return this.cellAvg(cx, cz) < 0.08; }

  buildingAt(cx: number, cz: number): Building | undefined {
    if (!this.inCells(cx, cz)) return undefined;
    const id = this.occ[this.ci(cx, cz)];
    return id ? this.buildings.get(id) : undefined;
  }

  nearWater(cx: number, cz: number, r = 3) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (this.inCells(x, z) && this.cellAvg(x, z) < -0.05) return true;
      }
    return false;
  }

  // ---------- Constructions ----------
  canPlace(kind: KindId, x: number, z: number): string | null {
    const s = KINDS[kind].size;
    if (!this.inCells(x, z) || !this.inCells(x + s - 1, z + s - 1)) return 'Hors de la carte';
    let mn = 99, mx = -99;
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const cx = x + i, cz = z + j;
        const k = this.ci(cx, cz);
        if (this.occ[k]) return 'Emplacement occupé';
        if (this.road[k] && kind !== 'lamp') return 'Une route est déjà ici';
        if (this.cellMin(cx, cz) < 0.05) return 'Trop proche de l’eau';
      }
    for (let j = 0; j <= s; j++)
      for (let i = 0; i <= s; i++) {
        const hh = this.h(x + i, z + j);
        mn = Math.min(mn, hh); mx = Math.max(mx, hh);
      }
    const target = this.flatTarget(x, z, s);
    if (mx - target > 0.85 * s || target - mn > 0.85 * s) return 'Terrain trop pentu';
    if (target < 0.05) return 'Trop proche de l\u2019eau';
    return null;
  }

  /** Hauteur de nivellement : celle d'un bâtiment voisin (pour rester raccordé) sinon la moyenne */
  flatTarget(x: number, z: number, s: number): number {
    for (let dz = -1; dz <= s; dz++)
      for (let dx = -1; dx <= s; dx++) {
        const nb = this.buildingAt(x + dx, z + dz);
        if (nb) return this.h(nb.x, nb.z);
      }
    let sum = 0, cnt = 0;
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) { sum += this.h(x + i, z + j); cnt++; }
    return sum / cnt;
  }

  place(kind: KindId, x: number, z: number, rot: number, auto: boolean, age: number, animate = true): Building {
    const s = KINDS[kind].size;
    // Aplanit l'empreinte
    const avg = this.flatTarget(x, z, s);
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) this.heights[this.vi(x + i, z + j)] = avg;
    const b: Building = { id: this.nextId++, kind, x, z, rot, auto, age };
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const k = this.ci(x + i, z + j);
        this.occ[k] = b.id;
        this.veg[k] = 0;
      }
    this.buildings.set(b.id, b);
    this.terrainDirty = this.vegDirty = true;
    this.version++;
    for (const l of this.listeners) l.onAdd(b, animate);
    return b;
  }

  removeBuilding(id: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    const s = KINDS[b.kind].size;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.occ[this.ci(b.x + i, b.z + j)] = 0;
    this.buildings.delete(id);
    this.terrainDirty = this.vegDirty = true;
    this.version++;
    for (const l of this.listeners) l.onRemove(b);
  }

  canRoad(cx: number, cz: number) {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (this.occ[k]) return false;
    return this.cellAvg(cx, cz) >= 0.08 && this.cellMin(cx, cz) > -0.15 && this.cellSlope(cx, cz) < 1.3;
  }

  setRoad(cx: number, cz: number, on: boolean): boolean {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (on) {
      if (this.road[k] || !this.canRoad(cx, cz)) return false;
      this.road[k] = 1;
      this.veg[k] = 0;
      this.vegDirty = true;
    } else {
      if (!this.road[k]) return false;
      this.road[k] = 0;
    }
    this.roadsDirty = true;
    this.version++;
    return true;
  }

  setVeg(cx: number, cz: number, type: number): boolean {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (type !== 0) {
      if (this.occ[k] || this.road[k]) return false;
      if (!this.vegFits(type, this.cellAvg(cx, cz), this.cellSlope(cx, cz), true)) return false;
    }
    if (this.veg[k] === type) return false;
    this.veg[k] = type;
    this.vegDirty = true;
    this.version++;
    return true;
  }

  /** Après sculpture : supprime routes/végétation devenues invalides */
  /** Terrain compatible avec un type de végétation (pose stricte, ou maintien plus tolérant après sculpture) */
  vegFits(type: number, avg: number, slope: number, placing: boolean) {
    // une grotte se creuse dans une pente raide, les rochers tiennent partout hors de l'eau
    if (type === VEG_CAVE) return avg >= 0.3 && slope >= (placing ? 0.7 : 0.5);
    // épave : eau peu profonde ou plage mouillée ; cratère : n'importe où hors de la mer
    if (type === VEG_WRECK) return avg >= -1 && avg <= 0.3;
    if (type === VEG_VOLCANO) return avg >= 0;
    // rien ne tient sur une paroi trop raide
    if (type === VEG_ROCKS) return avg >= (placing ? 0.12 : 0.08) && slope <= (placing ? 1 : 1.4);
    if (avg < (placing ? 0.2 : 0.1)) return false;
    return slope <= (type === VEG_FOREST ? (placing ? 1.4 : 1.8) : placing ? 0.6 : 0.9);
  }

  sanitize(x0: number, z0: number, x1: number, z1: number) {
    for (let cz = Math.max(0, z0); cz <= Math.min(N - 1, z1); cz++)
      for (let cx = Math.max(0, x0); cx <= Math.min(N - 1, x1); cx++) {
        const k = this.ci(cx, cz);
        if (this.veg[k] && !this.vegFits(this.veg[k], this.cellAvg(cx, cz), this.cellSlope(cx, cz), false)) { this.veg[k] = 0; this.vegDirty = true; }
        if (this.road[k] && !this.canRoad(cx, cz)) { this.road[k] = 0; this.roadsDirty = true; }
      }
    this.version++;
  }

  // ---------- Snapshots / sérialisation ----------
  snapshot(): Snapshot {
    return {
      heights: this.heights.slice(),
      road: this.road.slice(),
      veg: this.veg.slice(),
      buildings: [...this.buildings.values()].map((b) => ({ ...b })),
      nextId: this.nextId,
    };
  }

  restore(s: Snapshot) {
    this.heights.set(s.heights);
    this.road.set(s.road);
    this.veg.set(s.veg);
    this.occ.fill(0);
    this.buildings.clear();
    for (const b0 of s.buildings) {
      const b = { ...b0 };
      this.buildings.set(b.id, b);
      const sz = KINDS[b.kind].size;
      for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) this.occ[this.ci(b.x + i, b.z + j)] = b.id;
    }
    this.nextId = s.nextId;
    this.terrainDirty = this.roadsDirty = this.vegDirty = true;
    this.version++;
    for (const l of this.listeners) l.onReset();
  }

  toJSON() {
    const veg: number[] = [];
    for (let i = 0; i < this.veg.length; i++) if (this.veg[i]) veg.push(i, this.veg[i]);
    const roads: number[] = [];
    for (let i = 0; i < this.road.length; i++) if (this.road[i]) roads.push(i);
    return {
      n: N,
      heights: Array.from(this.heights, (v) => Math.round(v * 100)),
      roads,
      veg,
      buildings: [...this.buildings.values()].map((b) => [b.kind, b.x, b.z, b.rot, b.auto ? 1 : 0, b.age]),
      nextId: this.nextId,
    };
  }

  fromJSON(d: any) {
    if (!d || d.n !== N || !Array.isArray(d.heights) || d.heights.length !== this.heights.length) throw new Error('Sauvegarde incompatible');
    const heights = new Float32Array(d.heights.length);
    for (let i = 0; i < heights.length; i++) heights[i] = (+d.heights[i] || 0) / 100;
    const road = new Uint8Array(N * N), veg = new Uint8Array(N * N);
    for (const i of d.roads ?? []) if (i >= 0 && i < road.length) road[i] = 1;
    for (let i = 0; i + 1 < (d.veg ?? []).length; i += 2) if (d.veg[i] >= 0 && d.veg[i] < veg.length) veg[d.veg[i]] = d.veg[i + 1];
    const buildings: Building[] = [];
    let id = 1;
    for (const r of d.buildings ?? []) {
      if (!KINDS[r[0] as KindId]) continue;
      buildings.push({ id: id++, kind: r[0], x: r[1] | 0, z: r[2] | 0, rot: (r[3] | 0) & 3, auto: !!r[4], age: r[5] | 0 });
    }
    this.restore({ heights, road, veg, buildings, nextId: id });
  }
}
