import * as THREE from 'three';
import { World, N } from '../world/world';

const AGE_COL = [0xd8c19c, 0xe2d1ae, 0xcfc6b8, 0xb5aea6, 0x9ea3ac].map((c) => new THREE.Color(c));

/** Routes : bandes plaquées au relief, jonctions automatiques selon les voisins */
export class RoadView {
  mesh: THREE.Mesh;
  constructor(private world: World) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  rebuild(age: number, snow: number) {
    const w = this.world;
    const pos: number[] = [];
    const col: number[] = [];
    const base = AGE_COL[Math.min(age, 4)].clone().lerp(new THREE.Color(0xf2f6fa), snow * 0.75);
    const edge = base.clone().multiplyScalar(0.92);
    const W0 = 0.2, W1 = 0.8;
    const rect = (x0: number, z0: number, x1: number, z1: number, c: THREE.Color) => {
      const S = 2;
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const ax = x0 + ((x1 - x0) * i) / S, bx = x0 + ((x1 - x0) * (i + 1)) / S;
          const az = z0 + ((z1 - z0) * j) / S, bz = z0 + ((z1 - z0) * (j + 1)) / S;
          const y = (x: number, z: number) => w.hAt(x, z) + 0.035;
          const p00 = [ax, y(ax, az), az], p10 = [bx, y(bx, az), az], p01 = [ax, y(ax, bz), bz], p11 = [bx, y(bx, bz), bz];
          for (const v of [p00, p11, p10, p00, p01, p11]) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
        }
    };
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        if (!w.road[w.ci(cx, cz)]) continue;
        const has = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
        rect(cx + W0, cz + W0, cx + W1, cz + W1, base);
        if (has(0, -1)) rect(cx + W0, cz, cx + W1, cz + W0, edge);
        if (has(0, 1)) rect(cx + W0, cz + W1, cx + W1, cz + 1, edge);
        if (has(-1, 0)) rect(cx, cz + W0, cx + W0, cz + W1, edge);
        if (has(1, 0)) rect(cx + W1, cz + W0, cx + 1, cz + W1, edge);
        // les routes se tendent aussi vers une maison voisine (chemin d'accès)
        const b = (dx: number, dz: number) => { const n = w.buildingAt(cx + dx, cz + dz); return !!n && n.kind !== 'lamp'; };
        if (!has(0, -1) && b(0, -1)) rect(cx + 0.35, cz, cx + 0.65, cz + W0, edge);
        if (!has(0, 1) && b(0, 1)) rect(cx + 0.35, cz + W1, cx + 0.65, cz + 1, edge);
        if (!has(-1, 0) && b(-1, 0)) rect(cx, cz + 0.35, cx + W0, cz + 0.65, edge);
        if (!has(1, 0) && b(1, 0)) rect(cx + W1, cz + 0.35, cx + 1, cz + 0.65, edge);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}
