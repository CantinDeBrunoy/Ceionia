import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Parts } from '../src/render/parts';
import { arena, type ArenaKit } from '../src/render/arena';

/** Triangles d'une liste de géométries (non indexées, comme Parts les garde) */
const tris = (gs: THREE.BufferGeometry[]) => gs.reduce((n, g) => n + g.attributes.position.count / 3, 0);

/** L'arène à un âge, avec un kit factice qui garde les pièces mobiles et les spectateurs animés à part */
function draw(age: number, animated: boolean) {
  const p = new Parts(), moving: Parts[] = [], crowd: Parts[] = [], piece = () => { const q = new Parts(); moving.push(q); return q; };
  const kit: ArenaKit = { sway: piece, turn: piece, smoke: () => {} };
  if (animated) {
    kit.swing = piece;
    kit.fan = (d) => { const q = new Parts(); d(q); crowd.push(q); };
  }
  arena(p, age, kit);
  const n = tris(p.body) + tris(p.glow) + [...moving, ...crowd].reduce((s, q) => s + tris(q.body) + tris(q.glow), 0);
  return { p, n, crowd, moving };
}

describe('arène', () => {
  it('à chaque âge, sous le plafond des 3 × 3 (6 500 triangles, pièces mobiles et foule comprises), avec ou sans foule animée', () => {
    for (let age = 1; age <= 5; age++) for (const animated of [true, false]) {
      const { n } = draw(age, animated);
      expect(n, `âge ${age}`).toBeLessThanOrEqual(6500);
      expect(n, `âge ${age}`).toBeGreaterThan(3500);
    }
  });

  it('reste sur sa parcelle et garde une hauteur raisonnable ; la foule aussi', () => {
    for (let age = 1; age <= 5; age++) {
      const { p, crowd, moving } = draw(age, true);
      expect(crowd.length, `âge ${age}`).toBeGreaterThan(30);
      expect(moving.length, `âge ${age}`).toBeGreaterThan(2);
      const geos = [...p.body, ...p.glow, ...crowd.flatMap((q) => q.body)], bb = new THREE.Box3(), b = new THREE.Box3();
      for (const g of geos) {
        g.computeBoundingBox();
        bb.union(b.copy(g.boundingBox!));
        expect(Number.isFinite(g.boundingBox!.max.x + g.boundingBox!.max.y + g.boundingBox!.max.z), `âge ${age}`).toBe(true);
      }
      for (const v of [bb.max.x, -bb.min.x, bb.max.z, -bb.min.z]) expect(v, `âge ${age}`).toBeLessThanOrEqual(1.465);
      // elle remplit sa parcelle
      expect(Math.min(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z), `âge ${age}`).toBeGreaterThan(1.3);
      expect(bb.max.y, `âge ${age}`).toBeLessThan(1.6);
    }
  });

  it('un âge hors bornes prend le modèle le plus proche', () => {
    expect(draw(0, true).n).toBe(draw(1, true).n);
    expect(draw(6, true).n).toBe(draw(5, true).n);
  });
});
