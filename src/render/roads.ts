import * as THREE from 'three';
import { World, N } from '../world/world';

const AGE_COL = [0xd8c19c, 0xe2d1ae, 0xcfc6b8, 0xb5aea6, 0x9ea3ac].map((c) => new THREE.Color(c));
/** Ponts : tablier de bois, puis de pierre, puis d'acier ; piles et garde-corps */
const DECK_COL = [0x9a7452, 0xa27c58, 0x8f7c66, 0xa39d95, 0xb4b9c0].map((c) => new THREE.Color(c));
const PILE_COL = [0x6f5640, 0x6f5640, 0x8a8178, 0x8a8178, 0x7d838c].map((c) => new THREE.Color(c));

/** Routes : bandes plaquées au relief, jonctions automatiques selon les voisins */
export class RoadView {
  mesh: THREE.Mesh;
  constructor(private world: World) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
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
    const deck = DECK_COL[Math.min(age, 4)].clone().lerp(new THREE.Color(0xf2f6fa), snow * 0.6), pile = PILE_COL[Math.min(age, 4)];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]])
        for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) { pos.push(...v[i]); col.push(c.r, c.g, c.b); }
    };
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
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...quad[i]); col.push(deck.r, deck.g, deck.b); }
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
        const has = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
        const by = w.bridgeY(cx, cz);
        if (by !== null) { bridge(cx, cz, by, has); continue; }
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
