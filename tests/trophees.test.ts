import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Parts } from '../src/render/parts';
import { TROPHIES, Trophies, trophiesWon, trophyParts, trophySlot } from '../src/render/trophies';
import type { Building } from '../src/build/catalog';

describe('les trophées de la grande place', () => {
  it('un trophée par gros monstre vaincu, et seulement ceux-là', () => {
    expect(trophiesWon({ done: [], perks: [] })).toEqual([]);
    expect(trophiesWon({ done: ['herd', 'mammoth'], perks: ['furs'] })).toEqual(['mammoth']);
    // le monstre des mers : le trophée de la proie choisie (mégalodon ou kraken), pas les deux
    expect(trophiesWon({ done: ['mammoth', 'monster'], perks: ['furs', 'kraken'] })).toEqual(['mammoth', 'kraken']);
    expect(trophiesWon({ done: ['monster'], perks: ['megalodon', 'kraken'] })).toEqual(['kraken', 'megalodon']);
    // le dragon, quand son expédition existera
    expect(trophiesWon({ done: ['dragon'], perks: [] })).toEqual(['dragon']);
  });

  it('chacun a sa place, distincte, sur la place de chaque âge, loin du cœur et du bord', () => {
    for (let age = 0; age <= 5; age++) {
      const pts = TROPHIES.map((id) => trophySlot(id, age));
      for (const [i, [x, z]] of pts.entries()) {
        expect(Math.max(Math.abs(x), Math.abs(z)), `${age} ${TROPHIES[i]}`).toBeLessThan(1.3);
        expect(Math.hypot(x, z), `${age} ${TROPHIES[i]}`).toBeGreaterThan(0.8);
        for (const [j, q] of pts.entries()) if (j > i) expect(Math.hypot(x - q[0], z - q[1])).toBeGreaterThan(0.5);
      }
    }
  });

  it('chaque trophée tient sur son socle, à hauteur d’un petit monument', () => {
    for (const id of TROPHIES) for (let age = 0; age <= 5; age++) {
      const p = new Parts();
      trophyParts(p, id, age);
      const g = p.build().body;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.max.x - b.min.x, `${id} ${age}`).toBeLessThan(0.42);
      expect(b.max.z - b.min.z, `${id} ${age}`).toBeLessThan(0.42);
      expect(b.max.y, `${id} ${age}`).toBeGreaterThan(0.25);
      expect(b.max.y, `${id} ${age}`).toBeLessThan(0.7);
      expect(b.min.y, `${id} ${age}`).toBeGreaterThan(-0.05);
    }
  });

  it('se posent sur la place, et se refont quand un trophée s’ajoute', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    const plaza = { id: 7, kind: 'gather', x: 40, z: 50, rot: 1, auto: false, age: 2 } as Building;
    const t = new Trophies(w);
    t.sync(plaza, ['mammoth']);
    expect(t.group.children.length).toBe(1);
    const m = t.group.children[0] as THREE.Mesh;
    expect(t.group.position.x).toBe(41.5);
    expect(t.group.position.z).toBe(51.5);
    expect(m.position.y).toBeGreaterThan(w.h(40, 50) - 0.2);
    t.sync(plaza, ['mammoth']);
    expect(t.group.children[0]).toBe(m);
    t.sync(plaza, ['mammoth', 'megalodon']);
    expect(t.group.children.length).toBe(2);
    t.sync(null, ['mammoth', 'megalodon']);
    expect(t.group.children.length).toBe(0);
  });
});
