import { describe, it, expect } from 'vitest';
import { getModel } from '../src/render/models';
import type { KindId } from '../src/build/catalog';

/** Les tours de garde et casernes de l'île du portail : un vrai modèle détaillé à chaque âge, tous différents */
const verts = (kind: KindId, age: number) => {
  const m = getModel(kind, age, { v: 0, L: false, R: false, F: false });
  m.body.computeBoundingBox();
  return { n: m.body.attributes.position.count + (m.glow ? m.glow.attributes.position.count : 0), box: m.body.boundingBox!, glow: m.glow?.attributes.position.count ?? 0, smoke: m.smoke.length };
};

describe('défenses de l’île du portail', () => {
  for (const kind of ['watchtower', 'barracks'] as KindId[]) {
    it(`${kind} : détaillé et différent à chaque âge`, () => {
      const seen = new Set<number>();
      for (const age of [1, 2, 3, 4, 5]) {
        const r = verts(kind, age);
        expect(r.n).toBeGreaterThan(1500);
        expect(r.n).toBeLessThan(40000);
        expect(r.glow).toBeGreaterThan(0);
        seen.add(r.n);
      }
      expect(seen.size).toBe(5);
      // l'Antiquité (âges 0 et 1) a le même modèle
      expect(verts(kind, 0).n).toBe(verts(kind, 1).n);
    });
  }

  it('la tour reste sur sa case (1 × 1) et la caserne sur ses quatre (2 × 2)', () => {
    for (const age of [1, 2, 3, 4, 5]) {
      const t = verts('watchtower', age).box, b = verts('barracks', age).box;
      expect(t.max.x - t.min.x).toBeLessThan(1.2);
      expect(t.max.z - t.min.z).toBeLessThan(1.2);
      expect(t.max.y).toBeGreaterThan(1.3);
      expect(b.max.x - b.min.x).toBeLessThan(2.05);
      expect(b.max.z - b.min.z).toBeLessThan(2.05);
    }
  });
});
