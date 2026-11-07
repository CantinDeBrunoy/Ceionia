import * as THREE from 'three';
import { Actor } from './assets';

/** silhouettes d'une sorte d'acteur : un maillage instancié par pièce du modèle (pose de repos figée), et combien sont posées */
interface Silhouettes { meshes: THREE.InstancedMesh[]; n: number; cap: number; size: number }

/**
 * Silhouettes des acteurs lointains : au loin, une bête articulée (des dizaines d'os et un appel de dessin chacune, deux
 * avec son ombre) n'est plus qu'une copie figée de son modèle dans sa pose de repos, dessinée par lots instanciés : un appel
 * par sorte au lieu d'un par bête. La silhouette est prise une fois par sorte (clé) sur le premier acteur vu, dans le repère
 * de son `root` : la matrice de l'acteur suffit ensuite à la poser
 */
export class Impostors {
  group = new THREE.Group();
  private sets = new Map<string, Silhouettes>();
  private v = new THREE.Vector3();
  private rel = new THREE.Matrix4();
  private inv = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();

  /** Nombre de sortes de silhouettes prises (pour les tests) */
  get kinds() { return this.sets.size; }
  /** Silhouettes posées à la dernière image, pour la clé donnée */
  count(key: string) { return this.sets.get(key)?.n ?? 0; }

  /** Fige l'acteur (ses maillages articulés y compris) dans le repère de son `root`, sans sa position ni son cap */
  private bake(key: string, actor: Actor, size: number, cap = 32): Silhouettes {
    const root = actor.root, keep = { p: root.position.clone(), r: root.rotation.clone(), s: root.scale.clone(), parent: root.parent };
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);
    this.inv.copy(root.matrixWorld).invert();
    const meshes: THREE.InstancedMesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      const src = m.geometry, p = src.attributes.position, out = new Float32Array(p.count * 3), v = this.v;
      this.rel.multiplyMatrices(this.inv, m.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
        v.applyMatrix4(this.rel);
        out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(out, 3));
      for (const a of ['uv', 'color']) if (src.attributes[a]) g.setAttribute(a, src.attributes[a]);
      if (src.index) g.setIndex(src.index);
      for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.computeVertexNormals();
      meshes.push(this.make(g, m.material, cap));
    });
    root.position.copy(keep.p); root.rotation.copy(keep.r); root.scale.copy(keep.s);
    root.updateMatrixWorld(true);
    const s = { meshes, n: 0, cap, size };
    this.sets.set(key, s);
    return s;
  }

  private make(g: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], cap: number) {
    const im = new THREE.InstancedMesh(g, material, cap);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = im.receiveShadow = true;
    this.group.add(im);
    return im;
  }

  begin() { for (const s of this.sets.values()) s.n = 0; }

  /** Pose la silhouette de l'acteur (de la sorte `key`, son modèle à la taille `size`) à la matrice `m` */
  put(key: string, actor: Actor, m: THREE.Matrix4, size = 1) {
    const s = this.sets.get(key) ?? this.bake(key, actor, size);
    // la silhouette a la taille du premier acteur vu : les autres s'y ramènent par leur matrice
    if (size !== s.size) { const k = size / s.size; m = this.tmp.copy(m).scale(this.v.set(k, k, k)); }
    if (s.n >= s.cap) {
      // plus de bêtes de cette sorte au loin que prévu : des lots deux fois plus grands
      s.cap *= 2;
      s.meshes = s.meshes.map((old) => {
        this.group.remove(old);
        const im = this.make(old.geometry, old.material, s.cap);
        for (let i = 0; i < s.n; i++) { old.getMatrixAt(i, this.rel); im.setMatrixAt(i, this.rel); }
        old.dispose();
        return im;
      });
    }
    for (const im of s.meshes) im.setMatrixAt(s.n, m);
    s.n++;
  }

  end() {
    for (const s of this.sets.values())
      for (const im of s.meshes) {
        if (im.count === 0 && s.n === 0) continue;
        im.count = s.n;
        im.instanceMatrix.needsUpdate = true;
      }
  }
}
