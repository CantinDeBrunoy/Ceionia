import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, SEA, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { VegView, syncChunks } from '../src/render/vegetation';
import { makeSeasonState } from '../src/render/season';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  syncChunks();
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Positions (x, z) des instances d'une couche de végétation */
function spots(layer: { near: THREE.InstancedMesh[][] }) {
  const out: [number, number][] = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const meshes of layer.near) {
    const mesh = meshes[0];
    if (!mesh) continue;
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push([p.x, p.z]); }
  }
  return out;
}

describe('nénuphars, roseaux et algues : au bord de l’eau, jamais au large', () => {
  it('chacun pousse à quelques cases d’une terre ferme', { timeout: 60000 }, () => {
    const w = continent(), veg = new VegView(w) as any;
    veg.applySeason(makeSeasonState());
    const land = (x: number, z: number, r: number) => {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
        if (w.inCells(cx, cz) && (w.cellAvg(cx, cz) > SEA + 0.02 || w.lake[w.ci(cx, cz)])) return true;
      }
      return false;
    };
    for (const [name, r] of [['lily', 2], ['reed', 2], ['kelp', 3]] as [string, number][]) {
      const at = spots(veg[name]);
      for (const [x, z] of at) expect(land(x, z, r), `${name} en ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
    }
    // il en reste près des côtes
    expect(spots(veg.kelp).length).toBeGreaterThan(0);
  });
});
