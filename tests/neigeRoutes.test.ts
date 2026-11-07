import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { RoadView, roadSnowStep } from '../src/render/roads';

/** Le continent, toujours la même graine, avec un réseau de chemins qui franchit de l'eau (des ponts) */
function village() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  // des chemins en lignes droites à travers la carte : quelques-uns passent sur la rivière
  for (let z = 20; z < N - 20; z += 24) for (let x = 20; x < N - 20; x++) w.setRoad(x, z, true);
  return w;
}

const colors = (v: RoadView) => {
  const m = (v as unknown as { solid: THREE.Mesh }).solid;
  return Array.from((m.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array);
};
const snowAttr = (v: RoadView) => {
  const m = (v as unknown as { path: THREE.Mesh }).path;
  return Array.from((m.geometry.getAttribute('aSnow') as THREE.BufferAttribute).array as Float32Array);
};

describe('neige des chemins', () => {
  it('ne refait les chemins qu’au passage d’un seuil où les décors changent', () => {
    expect(roadSnowStep(0, 0)).toBe(false);
    expect(roadSnowStep(0, 0.01)).toBe(true);
    expect(roadSnowStep(0.1, 0.45)).toBe(false);
    expect(roadSnowStep(0.45, 0.55)).toBe(true);
    expect(roadSnowStep(0.55, 0.58)).toBe(false);
    expect(roadSnowStep(0.58, 0.9)).toBe(true);
    expect(roadSnowStep(0.9, 0.62)).toBe(false);
    expect(roadSnowStep(0.62, 0.2)).toBe(true);
  });

  it('suivre la neige sans refaire les chemins donne le même rendu que les refaire', () => {
    const w = village();
    for (const age of [1, 3]) {
      const a = new RoadView(w), b = new RoadView(w);
      a.rebuild(age, 0.3);
      b.rebuild(age, 0.1);
      const before = colors(b);
      b.setSnow(0.3);
      // tabliers des ponts : la neige s'y pose comme si on les avait refaits
      expect(colors(b)).toEqual(colors(a));
      expect(colors(b)).not.toEqual(before);
      // chemins : la part de neige du biome est la même, la saison passe par le shader
      expect(snowAttr(b)).toEqual(snowAttr(a));
      expect(b.builtSnow).toBe(0.1);
    }
  }, 60000);
});
