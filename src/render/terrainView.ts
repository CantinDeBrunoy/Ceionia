import * as THREE from 'three';
import { World, N, SEA } from '../world/world';
import { hash2, clamp } from '../core/rng';

export interface GroundPalette {
  grass: THREE.Color;
  snow: number;
  water: THREE.Color;
  waterOpacity: number;
}

const SAND = new THREE.Color(0xeedcaa);
const ROCK = new THREE.Color(0xb9b0a6);
const DEEP = new THREE.Color(0x5fa6bf);
const SHALLOW = new THREE.Color(0xa9d6c9);
const WHITE = new THREE.Color(0xf4f7fb);
const HIGH = new THREE.Color(0xc9d79a);

export class TerrainView {
  group = new THREE.Group();
  top: THREE.Mesh;
  skirt: THREE.Mesh;
  water: THREE.Mesh;
  waterMat: THREE.MeshStandardMaterial;
  private waterBase: Float32Array;
  private waterGeo: THREE.BufferGeometry;
  private pos = new Float32Array(N * N * 6 * 3);
  private col = new Float32Array(N * N * 6 * 3);
  private nor = new Float32Array(N * N * 6 * 3);
  private skPos = new Float32Array(4 * N * 6 * 3);
  private skCol = new Float32Array(4 * N * 6 * 3);
  private skNor = new Float32Array(4 * N * 6 * 3);
  private tmp = new THREE.Color();
  private frame = 0;

  constructor(private world: World) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.top = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.top.receiveShadow = true;
    this.top.castShadow = true;
    this.top.frustumCulled = false;

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.skPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(this.skCol, 3));
    sg.setAttribute('normal', new THREE.BufferAttribute(this.skNor, 3));
    this.skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
    this.skirt.frustumCulled = false;
    this.skirt.receiveShadow = true;

    // Eau
    const pg = new THREE.PlaneGeometry(N, N, 24, 24).rotateX(-Math.PI / 2).translate(N / 2, 0, N / 2).toNonIndexed();
    pg.deleteAttribute('uv');
    this.waterGeo = pg;
    this.waterBase = (pg.attributes.position.array as Float32Array).slice();
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x9fd8e0, transparent: true, opacity: 0.72, flatShading: true, roughness: 0.25, metalness: 0, depthWrite: false });
    this.water = new THREE.Mesh(pg, this.waterMat);
    this.water.receiveShadow = true;
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;

    this.group.add(this.top, this.skirt, this.water, this.makeWaterSides(), this.makeRock());
    this.update({ grass: new THREE.Color(0x8fcf7e), snow: 0, water: new THREE.Color(0x9fd8e0), waterOpacity: 0.72 });
  }

  private makeWaterSides() {
    const g = new THREE.Group();
    const depth = 3.6, e = 0.012;
    const sides: [number, number, number, number][] = [[N / 2, -e, 0, 0], [N / 2, N + e, 0, Math.PI], [-e, N / 2, 0, -Math.PI / 2], [N + e, N / 2, 0, Math.PI / 2]];
    for (const [x, z, , ry] of sides) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(N, depth), this.waterMat);
      m.position.set(x, -depth / 2, z);
      m.rotation.y = ry;
      m.renderOrder = 2;
      g.add(m);
    }
    return g;
  }

  private makeRock() {
    const R = (N / 2) * Math.SQRT2;
    const geo = new THREE.CylinderGeometry(R, 3, 13, 4, 4, true).rotateY(Math.PI / 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 6.4 && y > -6.4) {
        const j = 1 + (hash2(Math.round(p.getX(i) * 10), Math.round(y * 10), 3) - 0.5) * 0.28;
        p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j);
        p.setY(i, y + (hash2(i, 9, 3) - 0.5) * 1.2);
      }
    }
    const ng = geo.toNonIndexed();
    ng.deleteAttribute('uv');
    ng.computeVertexNormals();
    const c = new Float32Array(ng.attributes.position.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < ng.attributes.position.count; i++) {
      const t = (ng.attributes.position.getY(i) + 6.5) / 13;
      col.set(0x9a8c80).lerp(new THREE.Color(0xc2a98a), t);
      col.multiplyScalar(0.9 + hash2(Math.floor(i / 3), 5, 5) * 0.2);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.position.set(N / 2, -3.5 - 6.5, N / 2);
    m.castShadow = true;
    return m;
  }

  /** Reconstruit géométrie + couleurs */
  update(pal: GroundPalette) {
    const w = this.world;
    const pos = this.pos, col = this.col, nor = this.nor;
    const tmp = this.tmp;
    let o = 0;
    const vtx = (x: number, z: number) => w.h(x, z);
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const h00 = vtx(cx, cz), h10 = vtx(cx + 1, cz), h01 = vtx(cx, cz + 1), h11 = vtx(cx + 1, cz + 1);
        const avg = (h00 + h10 + h01 + h11) / 4;
        // triangle 1 : v00, v11, v10 ; triangle 2 : v00, v01, v11
        for (let t = 0; t < 2; t++) {
          const a = [cx, h00, cz];
          const b = t === 0 ? [cx + 1, h11, cz + 1] : [cx, h01, cz + 1];
          const c = t === 0 ? [cx + 1, h10, cz] : [cx + 1, h11, cz + 1];
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l; ny /= l; nz /= l;
          const th = (a[1] + b[1] + c[1]) / 3;
          this.tileColor(tmp, th, avg, ny, pal, hash2(cx, cz, t));
          for (const v of [a, b, c]) {
            pos[o] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2];
            nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
            col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
            o += 3;
          }
        }
      }
    this.top.geometry.attributes.position.needsUpdate = true;
    this.top.geometry.attributes.color.needsUpdate = true;
    this.top.geometry.attributes.normal.needsUpdate = true;
    this.updateSkirt(pal);
    this.waterMat.color.copy(pal.water);
    this.waterMat.opacity = pal.waterOpacity;
  }

  private tileColor(out: THREE.Color, h: number, avg: number, ny: number, pal: GroundPalette, n: number) {
    if (avg < 0.02) {
      const d = clamp(-avg / 1.5, 0, 1);
      out.copy(SHALLOW).lerp(DEEP, d);
    } else if (avg < 0.32) {
      out.copy(SAND);
      out.lerp(pal.grass, clamp((avg - 0.18) / 0.14, 0, 1) * 0.6);
    } else {
      out.copy(pal.grass);
      out.lerp(HIGH, clamp((avg - 2.5) / 4, 0, 0.6) * (1 - pal.snow));
    }
    if (avg >= 0.02) {
      const steep = clamp((0.86 - ny) / 0.12, 0, 1);
      if (steep > 0) out.lerp(ROCK, steep);
      if (pal.snow > 0) out.lerp(WHITE, pal.snow * (0.85 - steep * 0.35));
    }
    const v = 0.95 + n * 0.1;
    out.multiplyScalar(v);
  }

  private updateSkirt(pal: GroundPalette) {
    const w = this.world;
    const bottom = -3.5;
    let o = 0;
    const p = this.skPos, c = this.skCol, nn = this.skNor;
    const top = new THREE.Color(0xcfae82), bot = new THREE.Color(0x9a8267);
    const grass = new THREE.Color();
    const push = (x: number, y: number, z: number, nx: number, nz: number, col: THREE.Color) => {
      p[o] = x; p[o + 1] = y; p[o + 2] = z; nn[o] = nx; nn[o + 1] = 0; nn[o + 2] = nz;
      c[o] = col.r; c[o + 1] = col.g; c[o + 2] = col.b; o += 3;
    };
    const side = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
      const ha = w.h(ax, az), hb = w.h(bx, bz);
      grass.copy(pal.grass).lerp(WHITE, pal.snow * 0.8);
      const ca = ha > 0.1 ? grass : top, cb = hb > 0.1 ? grass : top;
      // quad : a-top, b-top, b-bottom, a-bottom ; orientation selon normale
      const aT = [ax, ha, az], bT = [bx, hb, bz], aB = [ax, bottom, az], bB = [bx, bottom, bz];
      const first = (bz - az) * nx - (bx - ax) * nz > 0;
      const tris = first
        ? [[aT, ca], [bT, cb], [bB, bot], [aT, ca], [bB, bot], [aB, bot]]
        : [[aT, ca], [bB, bot], [bT, cb], [aT, ca], [aB, bot], [bB, bot]];
      for (const [v, col] of tris as [number[], THREE.Color][]) push(v[0], v[1], v[2], nx, nz, col);
    };
    for (let i = 0; i < N; i++) {
      side(i, 0, i + 1, 0, 0, -1);
      side(i, N, i + 1, N, 0, 1);
      side(0, i, 0, i + 1, -1, 0);
      side(N, i, N, i + 1, 1, 0);
    }
    this.skirt.geometry.attributes.position.needsUpdate = true;
    this.skirt.geometry.attributes.color.needsUpdate = true;
    this.skirt.geometry.attributes.normal.needsUpdate = true;
  }

  animateWater(t: number, calm = 1) {
    this.frame++;
    const arr = this.waterGeo.attributes.position.array as Float32Array;
    const b = this.waterBase;
    for (let i = 0; i < arr.length; i += 3) {
      const x = b[i], z = b[i + 2];
      arr[i + 1] = SEA + (Math.sin(x * 0.9 + t * 1.3) + Math.sin(z * 1.1 + t * 1.1) + Math.sin((x + z) * 0.5 + t * 0.7)) * 0.018 * calm;
    }
    this.waterGeo.attributes.position.needsUpdate = true;
    if (this.frame % 2 === 0) this.waterGeo.computeVertexNormals();
  }

  /** Lance un rayon contre le relief ; retourne le point d'impact monde ou null */
  pick(ray: THREE.Ray): THREE.Vector3 | null {
    const w = this.world;
    const o = ray.origin, d = ray.direction;
    const inside = (x: number, z: number) => x >= 0 && z >= 0 && x <= N && z <= N;
    let prevT = 0, hit = false, t = 0;
    for (t = 0; t < 400; t += 0.4) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (inside(x, z) && y <= w.hAt(x, z)) { hit = true; break; }
      prevT = t;
    }
    if (!hit) return null;
    let lo = prevT, hi = t;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      const x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= w.hAt(x, z)) hi = m; else lo = m;
    }
    const x = o.x + d.x * hi, z = o.z + d.z * hi;
    return new THREE.Vector3(x, w.hAt(x, z), z);
  }
}
