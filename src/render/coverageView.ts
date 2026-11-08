import * as THREE from 'three';
import { World } from '../world/world';
import { computeCoverage, rangeOf } from '../sim/coverage';
import { sizeOf } from '../build/catalog';

/**
 * Surbrillance de la couverture de sécurité : un cercle vert au sol autour de chaque caserne et de chaque poste de police
 * (à leur portée), et une pastille orange sous les habitations qui n'ont pas les deux services (rouge : aucun des deux).
 * Refait seulement quand le monde change
 */
export class CoverageView {
  readonly group = new THREE.Group();
  private on = false;
  private version = -1;
  private world: World | null = null;
  private t = 0;
  private mats: THREE.Material[] = [];

  constructor(private getWorld: () => World, scene: THREE.Scene) {
    this.group.visible = false;
    scene.add(this.group);
  }

  set(on: boolean) {
    this.on = on;
    this.group.visible = on;
    this.version = -1;
  }

  get active() { return this.on; }

  update(dt: number) {
    if (!this.on) return;
    const w = this.getWorld();
    if (w !== this.world || w.version !== this.version) { this.world = w; this.version = w.version; this.build(w); }
    this.t += dt;
    const p = 0.5 + 0.5 * Math.sin(this.t * 3);
    for (const m of this.mats) m.opacity = (m.userData.base as number) * (0.7 + 0.3 * p);
  }

  private mat(color: number, opacity: number) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.base = opacity;
    this.mats.push(m);
    return m;
  }

  private build(w: World) {
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    for (const m of this.mats) m.dispose();
    this.mats = [];
    const cov = computeCoverage(w.buildings.values());
    const disc = this.mat(0x35e070, 0.1), ring = this.mat(0x7dffa5, 0.8), warn = this.mat(0xff9a2e, 0.7), bad = this.mat(0xff3b30, 0.75);
    const flat = (g: THREE.BufferGeometry, m: THREE.Material, x: number, z: number, y: number, order: number) => {
      const o = new THREE.Mesh(g, m);
      o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.renderOrder = order; o.frustumCulled = false;
      this.group.add(o);
    };
    for (const s of [...cov.stations.fire, ...cov.stations.police]) {
      const r = rangeOf(s), c = sizeOf(s) / 2, y = Math.max(w.hAt(s.x + c, s.z + c), 0) + 0.15;
      flat(new THREE.CircleGeometry(r, 64), disc, s.x + c, s.z + c, y, 6);
      flat(new THREE.RingGeometry(r - 0.25, r, 64), ring, s.x + c, s.z + c, y + 0.02, 7);
    }
    const none = new Set(cov.uncoveredFire.filter((h) => cov.uncoveredPolice.includes(h)));
    for (const h of new Set([...cov.uncoveredFire, ...cov.uncoveredPolice])) {
      const c = sizeOf(h) / 2, y = Math.max(w.hAt(h.x + c, h.z + c), 0) + 0.2;
      flat(new THREE.RingGeometry(c * 0.9, c * 1.35, 24), none.has(h) ? bad : warn, h.x + c, h.z + c, y, 8);
    }
  }
}
