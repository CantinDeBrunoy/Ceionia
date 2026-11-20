import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeFolk, folkTraits, FolkRole } from '../src/render/folk';

/** Maillages et triangles d'un habitant */
function cost(root: THREE.Object3D) {
  let meshes = 0, tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  return { meshes, tris };
}

describe('modèle des habitants', () => {
  it('cinq maillages au plus et moins de 1 100 triangles, à chaque âge, pour chaque allure', () => {
    let max = 0;
    for (let age = 0; age <= 5; age++)
      for (let v = 0; v < 60; v++)
        for (const look of [{}, { child: true }, { farmer: true }, { woman: true }, { woman: true, farmer: true }]) {
          const c = cost(makeFolk({ age, v, ...look }).root);
          expect(c.meshes).toBeLessThanOrEqual(5);
          max = Math.max(max, c.tris);
        }
    expect(max).toBeLessThan(1100);
  });

  it('les figures des expéditions aussi', () => {
    const roles: FolkRole[] = ['monk', 'juggler', 'sage', 'nomad', 'scholar', 'fisher', 'drummer', 'thief', 'astronaut'];
    for (const role of roles) for (const age of [0, 2, 3, 5]) {
      const c = cost(makeFolk({ age, v: 7, role }).root);
      expect(c.meshes).toBeLessThanOrEqual(5);
      expect(c.tris).toBeLessThan(1100);
    }
  });

  it('les articulations restent à leur place : hanches, épaules, mains (ce qu’on tient, la selle, le siège)', () => {
    const f = makeFolk({ age: 2, v: 3 });
    expect(f.legs.map((l) => l.position.toArray())).toEqual([[-0.019, 0.1, 0], [0.019, 0.1, 0]]);
    expect(f.arms.map((a) => a.position.toArray())).toEqual([[-0.052, 0.2, 0], [0.052, 0.2, 0]]);
    expect(f.hands[0].position.toArray()).toEqual([0, -0.09, 0.012]);
  });

  it('le corps tient debout entre le sol et 0,3 (avant l’échelle), la tête des enfants un peu plus grosse', () => {
    for (const age of [0, 3, 5]) {
      const f = makeFolk({ age, v: 11 });
      f.root.scale.setScalar(1);
      f.root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(f.root);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(b.max.y).toBeLessThan(0.36);
    }
  });

  it('les traits du portrait sont ceux du modèle', () => {
    for (let v = 0; v < 40; v++) {
      const t = folkTraits(v, false);
      const f = makeFolk({ age: 4, v });
      // la peau du portrait se retrouve sur le visage du modèle
      const col = ((f.body.children[0] as THREE.Mesh).geometry.attributes.color.array as Float32Array);
      const skin = new THREE.Color(t.skin);
      let found = false;
      for (let i = 0; i < col.length && !found; i += 3) found = Math.abs(col[i] - skin.r) < 1e-4 && Math.abs(col[i + 1] - skin.g) < 1e-4 && Math.abs(col[i + 2] - skin.b) < 1e-4;
      expect(found).toBe(true);
    }
  });
});
