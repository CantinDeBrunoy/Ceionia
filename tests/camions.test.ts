import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { unitGeo } from '../src/render/emergency';
import { Parts } from '../src/render/parts';
import { fireEngine, fireLadder, LADDER_AT } from '../src/render/fireEngine';

const box = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!; };

describe('camions de pompiers', () => {
  it('le fourgon moderne garde la taille des autres secours, ses gyrophares clignotent à part', () => {
    const fire = unitGeo('fire', 4, true), health = unitGeo('health', 4, true);
    const f = box(fire.body), h = box(health.body);
    expect(f.max.x - f.min.x).toBeLessThan(0.2);
    expect(f.max.z - f.min.z).toBeGreaterThan(0.4);
    expect(f.max.z - f.min.z).toBeLessThan(0.5);
    expect(Math.abs((f.max.z - f.min.z) - (h.max.z - h.min.z))).toBeLessThan(0.1);
    expect(f.min.y).toBeGreaterThanOrEqual(-0.001);
    // bleu et rouge, à l'avant et à l'arrière ; phares et feux arrière luisent
    expect(fire.lights.length).toBe(4);
    expect(new Set(fire.lights.map((l) => l[3]))).toEqual(new Set([0, 1]));
    expect(fire.glow).not.toBeNull();
    // l'échelle pivote sur sa tourelle, au-dessus du toit de la cabine
    expect(fire.ladder).not.toBeNull();
    expect(fire.ladderAt).toEqual(LADDER_AT);
    expect(LADDER_AT[1]).toBeGreaterThan(f.max.y - 0.03);
  });

  it('garé (devant la caserne), le camion peint ses gyrophares au lieu de les noter', () => {
    const p = new Parts(), lights: [number, number, number, number][] = [];
    fireEngine(p, 0.5, 0.03, -0.2);
    const parked = p.build(false);
    const q = new Parts();
    fireEngine(q, 0, 0, 0, lights);
    const moving = q.build(false);
    expect(lights.length).toBe(4);
    expect(parked.glow!.attributes.position.count).toBeGreaterThan(moving.glow!.attributes.position.count);
    const b = box(parked.body);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0.5, 2);
    expect(b.min.y).toBeCloseTo(0.03, 3);
  });

  it('garé devant la caserne, le camion allégé reste sobre en triangles', () => {
    const tris = (lite: boolean) => { const p = new Parts(); fireEngine(p, 0, 0, 0, undefined, lite); fireLadder(p, 0, 0.2, 0, lite); const b = p.build(false); return (b.body.attributes.position.count + (b.glow?.attributes.position.count ?? 0)) / 3; };
    expect(tris(true)).toBeLessThan(500);
    expect(tris(true)).toBeLessThan(tris(false) / 2);
  });

  it("l'échelle tient dans la longueur du camion, couchée", () => {
    const p = new Parts();
    fireLadder(p);
    const b = box(p.build(false).body);
    expect(b.max.z - b.min.z).toBeLessThan(0.36);
    expect(LADDER_AT[2] + b.max.z).toBeLessThan(0.22);
  });
});
