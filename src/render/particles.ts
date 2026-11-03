import * as THREE from 'three';
import { wind as air } from './wind';
import { smoothstep } from '../core/rng';

/** Réglages d'une bouffée : grossissement final, freinage de la montée, dérive du vent, opacité maximale */
export interface PuffStyle { grow?: number; drag?: number; wind?: number; alpha?: number }

interface Puff {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  size: number; age: number; life: number; col: THREE.Color; glow: number;
  grow: number; drag: number; wind: number; alpha: number;
}

/**
 * Bouffées (fumée, cendres, vapeur, embruns) : icosaèdres instanciés qui montent, grossissent et s'effacent,
 * avec une transparence et une lueur propres à chaque bouffée
 */
export class Puffs {
  mesh: THREE.InstancedMesh;
  private list: Puff[] = [];
  private alpha: THREE.InstancedBufferAttribute;
  private glow: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();

  constructor(private max: number, detail = 1) {
    const g = new THREE.IcosahedronGeometry(0.5, detail);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.glow = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute('aAlpha', this.alpha);
    g.setAttribute('aGlow', this.glow);
    this.mesh = new THREE.InstancedMesh(g, puffMaterial(), max);
    // couleur par instance dès la création (le shader en tient compte), particules mobiles : pas de culling
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 3;
  }

  get count() { return this.list.length; }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, col: THREE.Color, glow = 0, s: PuffStyle = {}) {
    if (this.list.length >= this.max) return;
    this.list.push({ x, y, z, vx, vy, vz, size, age: 0, life, col: col.clone(), glow, grow: s.grow ?? 2.4, drag: s.drag ?? 0.22, wind: s.wind ?? 0.3, alpha: s.alpha ?? 0.85 });
  }

  update(dt: number) {
    const d = this.dummy, m = this.mesh;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) { this.list.splice(i, 1); continue; }
      const t = p.age / p.life;
      // la bouffée ralentit en montant et s'incline sous le vent
      p.vy *= 1 - p.drag * dt;
      p.vx += p.wind * air.dx * dt;
      p.vz += p.wind * air.dz * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.age * 0.3, p.age * 0.2, 0);
      d.scale.setScalar(p.size * (1 + t * p.grow));
      d.updateMatrix();
      m.setMatrixAt(n, d.matrix);
      m.setColorAt(n, p.col);
      this.alpha.setX(n, Math.min(1, p.age / 0.4) * (1 - smoothstep(0.55, 1, t)) * p.alpha);
      this.glow.setX(n++, p.glow * Math.max(0, 1 - t * 3));
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.glow.needsUpdate = true;
  }
}

/** Bouffées : transparence et lueur par instance */
function puffMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aAlpha;\nattribute float aGlow;\nvarying float vAlpha;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vAlpha = aAlpha; vGlow = aGlow;`);
    sh.fragmentShader = 'varying float vAlpha;\nvarying float vGlow;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vAlpha;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * vGlow;');
  };
  m.customProgramCacheKey = () => 'puff';
  return m;
}
