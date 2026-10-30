import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN } from '../world/world';
import { hash2 } from '../core/rng';
import { SeasonState } from './season';

const SNOWC = new THREE.Color(0xf1f5f9);
const MAX_TREES = N * N * 3;

/** Végétation instanciée : arbres, champs, jardins */
export class VegView {
  group = new THREE.Group();
  private trunk: THREE.InstancedMesh;
  private blob: THREE.InstancedMesh;
  private pine: THREE.InstancedMesh;
  private plate: THREE.InstancedMesh;
  private rows: THREE.InstancedMesh;
  private flowers: THREE.InstancedMesh;
  private blobMat: THREE.MeshStandardMaterial;
  private pineMat: THREE.MeshStandardMaterial;
  private plateMat: THREE.MeshStandardMaterial;
  private rowMat: THREE.MeshStandardMaterial;
  private lastLeaf = -1;
  private lastSnow = -1;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(private world: World) {
    const std = (c: number) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95 });
    const trunkG = new THREE.CylinderGeometry(0.035, 0.055, 0.3, 5).translate(0, 0.15, 0);
    const blobG = new THREE.IcosahedronGeometry(0.22, 0).translate(0, 0.46, 0);
    const pineG = mergeCones();
    this.blobMat = std(0xffffff);
    this.pineMat = std(0x7fba86);
    this.plateMat = std(0xffffff);
    this.rowMat = std(0xffffff);
    this.trunk = this.inst(trunkG, std(0x9a7b62), MAX_TREES);
    this.blob = this.inst(blobG, this.blobMat, MAX_TREES);
    this.pine = this.inst(pineG, this.pineMat, MAX_TREES);
    this.plate = this.inst(new THREE.BoxGeometry(0.94, 0.05, 0.94).translate(0, 0.025, 0), this.plateMat, N * N);
    this.rows = this.inst(new THREE.BoxGeometry(0.78, 0.08, 0.1).translate(0, 0.05, 0), this.rowMat, N * N * 3);
    this.flowers = this.inst(new THREE.IcosahedronGeometry(0.06, 0).translate(0, 0.07, 0), std(0xffffff), N * N * 4);
    this.plate.receiveShadow = true;
    this.group.add(this.trunk, this.blob, this.pine, this.plate, this.rows, this.flowers);
  }

  private inst(g: THREE.BufferGeometry, m: THREE.Material, n: number) {
    const im = new THREE.InstancedMesh(g, m, n);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return im;
  }

  applySeason(s: SeasonState) {
    this.blobMat.color.copy(s.foliage);
    this.pineMat.color.setHex(0x7fba86).lerp(new THREE.Color(0xe8f0f4), s.snow * 0.7);
        this.rowMat.color.copy(s.crop);
    if (Math.abs(s.leaf - this.lastLeaf) > 0.03 || Math.abs(s.snow - this.lastSnow) > 0.03) this.rebuild(s);
  }

  rebuild(s: SeasonState) {
    this.lastLeaf = s.leaf;
    this.lastSnow = s.snow;
    const w = this.world, d = this.dummy, col = this.col;
    let nT = 0, nB = 0, nP = 0, nPl = 0, nR = 0, nF = 0;
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const t = w.veg[w.ci(cx, cz)];
        if (!t) continue;
        const hAvg = w.cellAvg(cx, cz);
        if (t === VEG_FOREST) {
          const cnt = hash2(cx, cz, 1) > 0.45 ? 3 : 2;
          for (let k = 0; k < cnt; k++) {
            const px = cx + 0.2 + hash2(cx, cz, 10 + k) * 0.6, pz = cz + 0.2 + hash2(cx, cz, 20 + k) * 0.6;
            const y = w.hAt(px, pz);
            const sc = 0.8 + hash2(cx, cz, 30 + k) * 0.7;
            const isPine = hash2(cx, cz, 40 + k) < 0.38 || y > 3.2;
            d.position.set(px, y, pz);
            d.rotation.set(0, hash2(cx, cz, 50 + k) * 6.28, 0);
            d.scale.set(sc, sc, sc);
            d.updateMatrix();
            this.trunk.setMatrixAt(nT++, d.matrix);
            if (isPine) {
              this.pine.setMatrixAt(nP, d.matrix);
              col.setScalar(0.85 + hash2(cx, cz, 60 + k) * 0.25);
              this.pine.setColorAt(nP++, col);
            } else {
              const ls = Math.max(0.25, s.leaf) * sc;
              d.scale.set(ls, ls * (0.8 + 0.2 * s.leaf), ls);
              d.updateMatrix();
              this.blob.setMatrixAt(nB, d.matrix);
              col.setScalar(0.85 + hash2(cx, cz, 60 + k) * 0.25);
              this.blob.setColorAt(nB++, col);
            }
          }
        } else if (t === VEG_FIELD) {
          d.position.set(cx + 0.5, hAvg, cz + 0.5);
          d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
          this.plate.setMatrixAt(nPl, d.matrix);
          col.set(0xc4a47c).lerp(SNOWC, s.snow * 0.9).multiplyScalar(0.94 + hash2(cx, cz, 3) * 0.12);
          this.plate.setColorAt(nPl++, col);
          for (let i = 0; i < 3; i++) {
            d.position.set(cx + 0.5, hAvg + 0.03, cz + 0.2 + i * 0.3);
            d.updateMatrix();
            this.rows.setMatrixAt(nR++, d.matrix);
          }
        } else if (t === VEG_GARDEN) {
          d.position.set(cx + 0.5, hAvg, cz + 0.5);
          d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
          this.plate.setMatrixAt(nPl, d.matrix);
          col.set(0x9ccf92).lerp(SNOWC, s.snow * 0.85).multiplyScalar(0.92 + hash2(cx, cz, 4) * 0.16);
          this.plate.setColorAt(nPl++, col);
          for (let i = 0; i < 4; i++) {
            d.position.set(cx + 0.2 + hash2(cx, cz, 70 + i) * 0.6, hAvg + 0.03, cz + 0.2 + hash2(cx, cz, 80 + i) * 0.6);
            d.updateMatrix();
            this.flowers.setMatrixAt(nF, d.matrix);
            col.setHSL(hash2(cx, cz, 90 + i) < 0.5 ? 0.92 : 0.13, 0.7, 0.8);
            this.flowers.setColorAt(nF++, col);
          }
        }
      }
    const set = (m: THREE.InstancedMesh, n: number) => {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    set(this.trunk, nT); set(this.blob, nB); set(this.pine, nP); set(this.plate, nPl); set(this.rows, nR); set(this.flowers, nF);
  }
}

function mergeCones(): THREE.BufferGeometry {
  const a = new THREE.ConeGeometry(0.24, 0.42, 6).translate(0, 0.42, 0);
  const b = new THREE.ConeGeometry(0.17, 0.36, 6).translate(0, 0.66, 0);
  const pa = a.toNonIndexed(), pb = b.toNonIndexed();
  const pos = new Float32Array(pa.attributes.position.array.length + pb.attributes.position.array.length);
  pos.set(pa.attributes.position.array as Float32Array, 0);
  pos.set(pb.attributes.position.array as Float32Array, pa.attributes.position.array.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
