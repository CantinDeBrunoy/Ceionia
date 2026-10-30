import { Building, KINDS, KindId } from '../build/catalog';

export const N = 48;
export const SEA = 0;
export const MAX_H = 9;
export const MIN_H = -2.4;

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

/** Vegetation: 0 rien, 1 forêt, 2 champ, 3 jardin */
export const VEG_FOREST = 1, VEG_FIELD = 2, VEG_GARDEN = 3;

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

  /** Hauteur exacte (mêmes triangles que le maillage) */
  hAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), N - 1e-4), z = Math.min(Math.max(wz, 0), N - 1e-4);
    const cx = Math.floor(x), cz = Math.floor(z);
    const u = x - cx, v = z - cz;
    const h00 = this.h(cx, cz), h10 = this.h(cx + 1, cz), h01 = this.h(cx, cz + 1), h11 = this.h(cx + 1, cz + 1);
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
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
      if (this.occ[k] || this.road[k] || this.cellAvg(cx, cz) < 0.2) return false;
      if (this.cellSlope(cx, cz) > (type === VEG_FOREST ? 1.4 : 0.6)) return false;
    }
    if (this.veg[k] === type) return false;
    this.veg[k] = type;
    this.vegDirty = true;
    this.version++;
    return true;
  }

  /** Après sculpture : supprime routes/végétation devenues invalides */
  sanitize(x0: number, z0: number, x1: number, z1: number) {
    for (let cz = Math.max(0, z0); cz <= Math.min(N - 1, z1); cz++)
      for (let cx = Math.max(0, x0); cx <= Math.min(N - 1, x1); cx++) {
        const k = this.ci(cx, cz);
        if (this.veg[k] && (this.cellAvg(cx, cz) < 0.1 || this.cellSlope(cx, cz) > (this.veg[k] === VEG_FOREST ? 1.8 : 0.9))) { this.veg[k] = 0; this.vegDirty = true; }
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
