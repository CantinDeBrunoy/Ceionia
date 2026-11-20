import { describe, it, expect } from 'vitest';
import { getModel } from '../src/render/models';
import { beamGeometry, BEAM_LEN } from '../src/render/beacon';

describe('le phare', () => {
  it('a son faisceau à chaque âge, qui part de la lanterne en haut de la tour et tourne lentement', () => {
    for (let age = 2; age < 6; age++) {
      const m = getModel('lighthouse', age, { v: 0, L: false, R: false, F: true });
      expect(m.beam, `âge ${age}`).toBeTruthy();
      const [x, y, z] = m.beam!.pivot;
      expect(y, `âge ${age}`).toBeGreaterThan(1.4);
      expect(Math.abs(x) < 1 && Math.abs(z) < 1).toBe(true);
      // un tour en 8 à 16 secondes
      expect(m.beam!.speed).toBeGreaterThan(1 / 16);
      expect(m.beam!.speed).toBeLessThan(1 / 8);
    }
  });

  it('le faisceau : deux cônes opposés et un éclat, chaque sommet du cône dit de quel côté il part (jamais 0 : pas de NaN dans le shader)', () => {
    const g = beamGeometry(), side = g.attributes.aSide, kind = g.attributes.aKind, pos = g.attributes.position;
    let plus = 0, minus = 0;
    for (let i = 0; i < side.count; i++) {
      expect(Math.abs(side.getX(i))).toBe(1);
      if (kind.getX(i) === 0) { if (pos.getX(i) > 0.01) plus++; if (pos.getX(i) < -0.01) minus++; expect(Math.abs(pos.getX(i))).toBeLessThanOrEqual(BEAM_LEN + 1e-6); }
    }
    expect(plus).toBeGreaterThan(0);
    expect(minus).toBe(plus);
    // peu de triangles : c'est un décor
    expect(pos.count / 3).toBeLessThan(200);
  });
});
