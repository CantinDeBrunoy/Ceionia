import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N } from '../world/world';
import { getModel } from './models';
import { mats } from './materials';
import { hash2 } from '../core/rng';

/** Hauteur des pavés au-dessus du relief affiché (assez pour ne pas se mêler à l'herbe, sous les routes et les bâtiments) */
const LIFT = 0.004;

/**
 * Les cases pavées (`World.paving`) : un habillage du sol, dessiné à part des bâtiments. Chaque case reçoit le modèle des pavés
 * de l'âge du village (`decor.ts` › `paving` : pierres plates, dallage de marbre, pavés, briques, dalles, dalles lumineuses),
 * qui couvre toute la case bord à bord et épouse le relief (chaque sommet suit `hAt`), si bien que deux cases voisines se
 * suivent sans couture. Les bâtiments et les décorations se posent par-dessus ; sous une route, le pavé ne se dessine pas (la
 * route le couvre). Tout tient en un maillage (et un pour les lumières futuristes), refait quand les pavés, les routes, le
 * relief ou l'âge changent
 */
export class PavingView {
  group = new THREE.Group();
  private body: THREE.Mesh | null = null;
  private glow: THREE.Mesh | null = null;
  private key = '';

  constructor(private world: World) {}

  update(age: number) {
    const w = this.world, key = `${w.pavingVersion}|${w.version}|${w.visVersion}|${age}`;
    if (key === this.key) return;
    this.key = key;
    this.rebuild(age);
  }

  private rebuild(age: number) {
    const w = this.world, bodies: THREE.BufferGeometry[] = [], glows: THREE.BufferGeometry[] = [];
    for (let k = 0; k < N * N; k++) {
      if (!w.paving[k] || w.road[k]) continue;
      const cx = k % N, cz = Math.floor(k / N);
      // (trois variantes, tirées de la case : les pierres ne se répètent pas d'une case à l'autre)
      const m = getModel('paving', age, { v: Math.floor(hash2(cx, cz, 7) * 6), L: false, R: false, F: false });
      bodies.push(this.place(m.body, cx, cz));
      if (m.glow) glows.push(this.place(m.glow, cx, cz));
    }
    this.set('body', bodies, mats.body);
    this.set('glow', glows, mats.glow);
  }

  /** Une copie du modèle posée sur sa case, chaque sommet à la hauteur du relief sous lui */
  private place(src: THREE.BufferGeometry, cx: number, cz: number) {
    const g = src.clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx + 0.5, z = p.getZ(i) + cz + 0.5;
      p.setXYZ(i, x, p.getY(i) + this.world.hAt(x, z) + LIFT, z);
    }
    g.computeVertexNormals();
    return g;
  }

  private set(which: 'body' | 'glow', list: THREE.BufferGeometry[], mat: THREE.Material) {
    const old = this[which];
    if (old) { this.group.remove(old); old.geometry.dispose(); this[which] = null; }
    if (!list.length) return;
    const geo = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this[which] = mesh;
  }
}
