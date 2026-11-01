import * as THREE from 'three';
import { World } from '../world/world';

/** Couleur chaude de la lumière des feux et des lanternes */
const WARM = new THREE.Color(1, 0.7, 0.36);

/**
 * Halos de lumière la nuit : une flaque de lumière chaude, drapée sur le relief, autour des feux de camp, des feux des
 * jardins, des braseros, lanternes et réverbères ; elle vacille un peu et s'éteint au lever du jour
 */
export class Halos {
  mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private key = '';
  private t = 0;

  constructor(private world: World) {
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Sources de lumière : x, z, rayon, intensité à la suite ; refait les halos si elles ont changé */
  set(points: number[]) {
    const key = points.map((v) => v.toFixed(2)).join(',');
    if (key === this.key) return;
    this.key = key;
    const w = this.world, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i < points.length; i += 4) {
      const x0 = points[i], z0 = points[i + 1], r = points[i + 2], k = points[i + 3];
      // disque en anneaux concentriques : la lumière décroît du centre au bord, chaque sommet posé sur le sol
      const RINGS = 5, SEG = 20, base = pos.length / 3;
      for (let j = 0; j <= RINGS; j++) {
        const rr = (j / RINGS) * r, a = (1 - j / RINGS) ** 2 * k;
        for (let s = 0; s < (j ? SEG : 1); s++) {
          const ang = (s / SEG) * Math.PI * 2, x = x0 + Math.cos(ang) * rr, z = z0 + Math.sin(ang) * rr;
          pos.push(x, w.surfaceAt(x, z) + 0.03, z);
          col.push(WARM.r, WARM.g, WARM.b, a);
        }
      }
      for (let s = 0; s < SEG; s++) idx.push(base, base + 1 + s, base + 1 + ((s + 1) % SEG));
      for (let j = 1; j < RINGS; j++)
        for (let s = 0; s < SEG; s++) {
          const a0 = base + 1 + (j - 1) * SEG + s, a1 = base + 1 + (j - 1) * SEG + ((s + 1) % SEG), b0 = a0 + SEG, b1 = a1 + SEG;
          idx.push(a0, b0, a1, a1, b0, b1);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  /** night : 0 le jour … 1 en pleine nuit */
  update(dt: number, night: number) {
    this.t += dt;
    this.mat.opacity = night * (0.78 + 0.1 * Math.sin(this.t * 7.3) * Math.sin(this.t * 3.1) + 0.05 * Math.sin(this.t * 13));
    this.mesh.visible = this.mat.opacity > 0.01;
  }
}
