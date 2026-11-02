import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Constructeur de géométries low-poly : tout est fusionné en 1 (corps) + 1 (lumières) */
export class Parts {
  body: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, ry = 0, glow = false, rz = 0, rx = 0) {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    ng.deleteAttribute('uv');
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    ng.applyMatrix4(_m);
    ng.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = ng.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (glow) {
      // la graine de cette lumière (voir LIGHTS) : une fenêtre (> 0) a son heure, une flamme ou une lanterne (< 0, teinte
      // chaude) vacille à son rythme
      const seed = 0.05 + 0.95 * Math.abs((Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453) % 1);
      ng.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(n).fill(c.r > c.b + 0.15 ? -seed : seed), 1));
    }
    (glow ? this.glow : this.body).push(ng);
  }

  /** y = base de la boîte */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, glow = false, rz = 0) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, color, ry, glow, rz);
  }
  cyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow = false, ry = 0) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), x, y, z, color, ry, glow);
  }
  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow = false, ry = 0) {
    this.cyl(0, r, h, seg, x, y, z, color, glow, ry);
  }
  sphere(r: number, x: number, y: number, z: number, color: number, detail = 0, sy = 1) {
    this.add(new THREE.IcosahedronGeometry(r, detail).scale(1, sy, 1), x, y, z, color);
  }
  pyramid(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0) {
    this.add(new THREE.ConeGeometry(0.70711, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0), x, y, z, color, ry);
  }
  /** Toit à deux pans, faîtage le long de x */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0) {
    const a = [-w / 2, 0, d / 2], b = [w / 2, 0, d / 2], c = [w / 2, h, 0], dd = [-w / 2, h, 0];
    const e = [w / 2, 0, -d / 2], f = [-w / 2, 0, -d / 2], g = [-w / 2, h, 0], hh = [w / 2, h, 0];
    const tris = [a, b, c, a, c, dd, e, f, g, e, g, hh, b, e, hh, f, a, dd];
    const pos = new Float32Array(tris.length * 3);
    tris.forEach((v, i) => pos.set(v, i * 3));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.add(geo, x, y, z, color, ry);
  }

  /** ao : occlusion ambiante factice (inutile pour les petits objets mobiles) */
  build(ao = true): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null } {
    const body = mergeGeometries(this.body, false)!;
    // occlusion ambiante factice : le pied des murs et des objets s'assombrit au contact du sol
    const py = body.attributes.position, col = body.attributes.color;
    for (let i = 0; i < (ao ? py.count : 0); i++) {
      const t = Math.min(1, Math.max(0, py.getY(i) / 0.22));
      const f = 0.72 + 0.28 * t * t * (3 - 2 * t);
      col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
    }
    const glow = this.glow.length ? mergeGeometries(this.glow, false) : null;
    for (const g of this.body) g.dispose();
    for (const g of this.glow) g.dispose();
    return { body, glow };
  }
}
