import * as THREE from 'three';

/**
 * Le portail de l'île s'éteint dans une explosion de lumière dorée (la chute du royaume des Enfers) : une colonne de lumière
 * qui jaillit puis s'amincit, une sphère qui enfle et s'efface, un anneau qui court au sol, des étincelles d'or qui montent et
 * retombent en pluie. Un groupe posé sur le monde, qui se retire de lui-même une fois fini
 */

const SPARKS = 220;
export const BURST_TIME = 4.5;

export class GoldenBurst {
  group = new THREE.Group();
  private t = 0;
  private pillar: THREE.Mesh;
  private shell: THREE.Mesh;
  private ring: THREE.Mesh;
  private sparks: THREE.Points;
  private vel = new Float32Array(SPARKS * 3);

  /** (x, y, z) : le pied du portail, sur le monde */
  constructor(x: number, y: number, z: number) {
    const add = (color: THREE.Color, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 16, 1, true).translate(0, 15, 0), add(new THREE.Color(2.2, 1.7, 0.7), 0.8));
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), add(new THREE.Color(2, 1.5, 0.6), 0.6));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), add(new THREE.Color(2, 1.6, 0.7), 0.9));
    this.shell.position.y = 1.2;
    this.ring.position.y = 0.08;
    const g = new THREE.BufferGeometry(), pos = new Float32Array(SPARKS * 3);
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 7, out = 0.6 + Math.random() * 3.2;
      pos[i * 3 + 1] = 1 + Math.random() * 0.8;
      this.vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(2.4, 1.8, 0.7), size: 0.16, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    for (const m of [this.pillar, this.shell, this.ring, this.sparks]) { m.renderOrder = 12; this.group.add(m); }
    this.group.position.set(x, y, z);
  }

  /** Une image ; false une fois fini (le groupe peut être retiré) */
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t, k = Math.min(1, t / BURST_TIME);
    // la colonne jaillit, s'élargit un instant, puis s'amincit et s'efface
    const pk = Math.min(1, t / 0.25);
    this.pillar.scale.set(pk * (1.6 - k), pk, pk * (1.6 - k));
    (this.pillar.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k) * pk;
    this.shell.scale.setScalar(0.5 + Math.sqrt(k) * 9);
    (this.shell.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, 1 - k * 1.6);
    this.ring.scale.setScalar(0.5 + k * 22);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    // les étincelles montent, ralentissent, retombent
    const p = this.sparks.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array, v = this.vel;
    for (let i = 0; i < SPARKS; i++) {
      v[i * 3 + 1] -= 3.2 * dt;
      v[i * 3] *= 0.985; v[i * 3 + 2] *= 0.985;
      a[i * 3] += v[i * 3] * dt; a[i * 3 + 1] = Math.max(0.05, a[i * 3 + 1] + v[i * 3 + 1] * dt); a[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    p.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = 1 - k * k;
    return t < BURST_TIME;
  }

  dispose() {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  }
}
