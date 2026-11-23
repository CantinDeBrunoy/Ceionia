import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { RangeView } from '../src/build/rangeView';
import { drapeTiles } from '../src/build/zones';
import { FIRE_RANGE, policeRange } from '../src/sim/coverage';

/** La portée d'un poste de sécurité montrée à la pose : les cases à portée, case par case */
describe('portée à la pose', () => {
  beforeAll(() => setMapSize(192));

  it('guetteurs et pompiers : 14 cases ; gardes, police et tour de garde : celle de la police ; les autres : rien', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    expect(RangeView.range(w, 'fire', 0)).toBe(FIRE_RANGE);
    expect(RangeView.range(w, 'police', 3)).toBe(policeRange(3));
    expect(RangeView.range(w, 'watchtower', 2)).toBe(policeRange(2));
    expect(RangeView.range(w, 'house', 2)).toBe(0);
  });

  it('les tuiles : toutes les cases dont le centre est à 14 cases du centre du poste, ni plus ni moins', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const [sx, sz] = w.startSpot(), cx = sx + 1, cz = sz + 1;
    const inR = (x: number, z: number) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= FIRE_RANGE;
    let want = 0;
    for (let z = cz - 15; z <= cz + 15; z++) for (let x = cx - 15; x <= cx + 15; x++) if (inR(x, z)) want++;
    const t = drapeTiles(w, cx - 15, cz - 15, cx + 15, cz + 15, inR);
    expect(t.n).toBe(want);
    expect(want).toBeGreaterThan(600);
    // la vue suit le bâtiment : rien sans portée
    const scene = new THREE.Scene(), v = new RangeView(scene);
    v.show(w, 'fire', sx, sz, 0);
    expect(v.visible).toBe(true);
    v.show(w, 'house', sx, sz, 0);
    expect(v.visible).toBe(false);
  });
});
