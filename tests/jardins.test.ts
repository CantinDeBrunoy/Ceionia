import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, VEG_GARDEN } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { findGardens, layoutGarden } from '../src/world/gardens';
import { syncChunks } from '../src/render/vegetation';
import { GardenView, GARDEN_PIECES } from '../src/render/gardens';

/** Le continent des tests, toujours la même graine, et un jardin de w × d cases peint sur de la terre plate */
function setup(gw: number, gd: number) {
  setMapSize(192);
  syncChunks();
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  for (let z = 8; z < N - 8 - gd; z++)
    for (let x = 8; x < N - 8 - gw; x++) {
      let ok = true;
      for (let i = 0; i < gw && ok; i++) for (let j = 0; j < gd && ok; j++) ok = w.cellAvg(x + i, z + j) > 0.5 && w.cellSlope(x + i, z + j) < 0.6 && !w.occ[w.ci(x + i, z + j)] && !w.road[w.ci(x + i, z + j)] && !w.isWet(x + i, z + j);
      if (!ok) continue;
      for (let i = 0; i < gw; i++) for (let j = 0; j < gd; j++) { w.veg[w.ci(x + i, z + j)] = VEG_GARDEN; w.decor[w.ci(x + i, z + j)] = 0; }
      return { w, g: findGardens(w).find((g) => g.set.has(w.ci(x, z)))! };
    }
  throw new Error('pas de place pour un jardin');
}

/** Triangles de tout ce que la vue des jardins a construit */
function tris(o: THREE.Object3D) {
  let n = 0;
  o.traverse((m) => { if (m instanceof THREE.Mesh && !(m instanceof THREE.InstancedMesh)) n += m.geometry.attributes.position.count / 3; });
  return n;
}

describe('jardins (rendu)', () => {
  it('le rendu sait dessiner chaque élément de chaque âge', () => {
    const { w, g } = setup(7, 6);
    for (let age = 0; age <= 5; age++)
      for (const it of layoutGarden(w, g, age).items) expect(GARDEN_PIECES.has(it.k), `${it.k} à l’âge ${age}`).toBe(true);
  });

  it('chaque âge reste léger (moins de 1 200 triangles par case) et en peu de maillages', () => {
    const { w, g } = setup(7, 6);
    const view = new GardenView(w);
    for (let age = 0; age <= 5; age++) {
      view.sync(age);
      const n = tris(view.group);
      expect(n / g.cells.length, `âge ${age}`).toBeLessThan(1200);
      // décor, néons, persistant, feuillage, fleurs, eau, verre, dalles : quelques maillages, plus les pièces animées
      let meshes = 0;
      view.group.traverse((m) => { if (m instanceof THREE.Mesh) meshes++; });
      expect(meshes, `âge ${age}`).toBeLessThan(40);
    }
  });

  it('le jardin futuriste brille la nuit (néons) et a sa serre de verre', () => {
    const { w } = setup(7, 6);
    const view = new GardenView(w);
    view.sync(5);
    let neon = 0, glass = false;
    view.group.traverse((m) => {
      if (!(m instanceof THREE.Mesh) || m instanceof THREE.InstancedMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.transparent && mat.opacity < 0.5) glass = true;
      if (m.geometry.attributes.aLight) neon += m.geometry.attributes.position.count;
    });
    expect(glass).toBe(true);
    expect(neon).toBeGreaterThan(500);
  });
});
