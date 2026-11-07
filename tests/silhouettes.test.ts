import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Impostors } from '../src/render/impostors';
import { makeBeast } from '../src/render/beasts';

/** Boîte englobante d'un maillage instancié, pour une instance */
function box(im: THREE.InstancedMesh, i: number) {
  const m = new THREE.Matrix4();
  im.getMatrixAt(i, m);
  im.geometry.computeBoundingBox();
  return im.geometry.boundingBox!.clone().applyMatrix4(m);
}

describe('silhouettes des bêtes lointaines', () => {
  it('une silhouette par sorte, figée dans le repère de la bête, de la taille de son modèle', () => {
    const imp = new Impostors();
    const bear = makeBeast('bear', 0, 1);
    bear.root.position.set(10, 2, 5);
    bear.root.rotation.y = 1;
    bear.root.updateMatrix();
    imp.begin();
    imp.put('beast:bear:0', bear, bear.root.matrix, 1);
    imp.end();
    expect(imp.kinds).toBe(1);
    expect(imp.count('beast:bear:0')).toBe(1);
    // la bête n'a pas bougé pendant la prise
    expect(bear.root.position.toArray()).toEqual([10, 2, 5]);
    expect(bear.root.rotation.y).toBe(1);
    const meshes = imp.group.children as THREE.InstancedMesh[];
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      expect(m.count).toBe(1);
      expect(m.geometry.attributes.position.count).toBeGreaterThan(0);
      expect(m.geometry.attributes.skinIndex).toBeUndefined();
    }
    // la silhouette est posée là où est la bête, et pas plus grande qu'elle (un ours : moins de deux cases)
    const b = meshes.map((m) => box(m, 0)).reduce((a, c) => a.union(c));
    expect(Math.abs(b.getCenter(new THREE.Vector3()).x - 10)).toBeLessThan(1);
    expect(Math.abs(b.getCenter(new THREE.Vector3()).z - 5)).toBeLessThan(1);
    expect(b.min.y).toBeGreaterThan(1.8);
    expect(b.max.y - b.min.y).toBeLessThan(2);
  });
  it('les bêtes suivantes de la même sorte partagent la silhouette, à leur taille', () => {
    const imp = new Impostors();
    const a = makeBeast('bear', 0, 1), cub = makeBeast('bear', 0, 0.55);
    a.root.updateMatrix(); cub.root.updateMatrix();
    imp.begin();
    imp.put('beast:bear:0', a, a.root.matrix, 1);
    imp.put('beast:bear:0', cub, cub.root.matrix, 0.55);
    imp.end();
    expect(imp.kinds).toBe(1);
    expect(imp.count('beast:bear:0')).toBe(2);
    const m = imp.group.children[0] as THREE.InstancedMesh;
    const big = box(m, 0).getSize(new THREE.Vector3()), small = box(m, 1).getSize(new THREE.Vector3());
    expect(small.y / big.y).toBeCloseTo(0.55, 2);
    // image suivante : on repart de zéro
    imp.begin(); imp.end();
    expect(imp.count('beast:bear:0')).toBe(0);
    expect(m.count).toBe(0);
  });
  it('les lots grandissent quand une sorte dépasse la place prévue', () => {
    const imp = new Impostors();
    const a = makeBeast('wolf', 0, 1);
    a.root.updateMatrix();
    imp.begin();
    for (let i = 0; i < 70; i++) imp.put('beast:wolf:0', a, a.root.matrix, 1);
    imp.end();
    expect(imp.count('beast:wolf:0')).toBe(70);
    for (const m of imp.group.children as THREE.InstancedMesh[]) expect(m.count).toBe(70);
  });
});
