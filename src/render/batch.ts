import * as THREE from 'three';

/**
 * Lot de maillages dessinés en un seul appel (`THREE.BatchedMesh`) : chaque géométrie partagée n'y est copiée qu'une fois,
 * comptée par ses utilisateurs, et chaque instance a sa matrice. Le lot grandit de lui-même (instances et sommets) et se
 * tasse quand les géométries retirées laissent trop de place perdue. Toutes les géométries doivent avoir les mêmes
 * attributs (et aucune d'index)
 */
export class GeoBatch {
  readonly mesh: THREE.BatchedMesh;
  private geos = new Map<THREE.BufferGeometry, { id: number; refs: number; n: number }>();
  /** sommets occupés par les géométries actives, fin de la zone remplie (place perdue comprise), capacité */
  private used = 0;
  private end = 0;
  private maxVerts: number;
  private maxInst: number;
  private live = 0;

  constructor(material: THREE.Material, maxInst = 256, maxVerts = 1 << 18) {
    this.maxInst = maxInst;
    this.maxVerts = maxVerts;
    this.mesh = new THREE.BatchedMesh(maxInst, maxVerts, 0, material);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    // le lot couvre toute la carte : chaque instance est écartée à part hors de la vue
    this.mesh.frustumCulled = false;
  }

  /** Nombre de géométries différentes dans le lot (pour les tests) */
  get geometryCount() { return this.geos.size; }
  get instanceCount() { return this.live; }

  private acquire(g: THREE.BufferGeometry) {
    const k = this.geos.get(g);
    if (k) { k.refs++; return k.id; }
    const n = g.attributes.position.count;
    if (this.end + n > this.maxVerts) {
      // d'abord tasser la place laissée par les géométries retirées, puis agrandir
      if (this.end > this.used) { this.mesh.optimize(); this.end = this.used; }
      if (this.end + n > this.maxVerts) {
        while (this.end + n > this.maxVerts) this.maxVerts *= 2;
        this.mesh.setGeometrySize(this.maxVerts, 0);
      }
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    const id = this.mesh.addGeometry(g);
    this.used += n; this.end += n;
    this.geos.set(g, { id, refs: 1, n });
    return id;
  }

  private release(g: THREE.BufferGeometry) {
    const k = this.geos.get(g);
    if (!k || --k.refs > 0) return;
    this.mesh.deleteGeometry(k.id);
    this.geos.delete(g);
    this.used -= k.n;
  }

  /** La géométrie, si elle peut entrer dans le lot (mêmes attributs que les autres) ; -1 sinon */
  private tryAcquire(g: THREE.BufferGeometry) {
    try { return this.acquire(g); } catch { return -1; }
  }

  /** Nouvelle instance de la géométrie : son numéro (-1 si la géométrie ne peut pas entrer dans le lot) */
  add(g: THREE.BufferGeometry) {
    if (this.live >= this.maxInst) { this.maxInst *= 2; this.mesh.setInstanceCount(this.maxInst); }
    const geo = this.tryAcquire(g);
    if (geo < 0) return -1;
    const id = this.mesh.addInstance(geo);
    this.live++;
    return id;
  }

  /** L'instance prend une autre géométrie (l'ancienne quitte le lot si plus personne ne s'en sert) ; false si elle n'y entre pas */
  swap(inst: number, from: THREE.BufferGeometry, to: THREE.BufferGeometry) {
    if (from === to) return true;
    const geo = this.tryAcquire(to);
    if (geo < 0) return false;
    this.mesh.setGeometryIdAt(inst, geo);
    this.release(from);
    return true;
  }

  remove(inst: number, g: THREE.BufferGeometry) {
    this.mesh.deleteInstance(inst);
    this.live--;
    this.release(g);
  }

  setMatrix(inst: number, m: THREE.Matrix4) { this.mesh.setMatrixAt(inst, m); }
}
