import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, ROAD_SLOPE, SWITCH_SLOPE } from '../src/world/world';
import { planRoad, LACET_GRADE } from '../src/build/freeRoad';
import { sampleCurve } from '../src/world/curves';

/**
 * Un coteau de 48 cases de côté : la plaine à 0,5 au sud (z > 34), un versant qui monte de `g` par case vers le nord, un
 * plateau en haut (z < 34 − hauteur / g)
 */
function coteau(g = 1.5, haut = 9): World {
  setMapSize(48);
  const w = new World();
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) w.heights[w.vi(x, z)] = 0.5 + Math.min(haut, Math.max(0, (34 - z) * g));
  w.updateVis();
  return w;
}

/** Hauteur du relief de jeu au point (x, z) */
const ground = (w: World, x: number, z: number) => {
  const cx = Math.floor(x), cz = Math.floor(z), fx = x - cx, fz = z - cz, [a, b, c, d] = w.cellCorners(cx, cz);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
};

describe('route en lacets', () => {
  it('un versant trop raide pour une route case par case se monte en lacets, à pente douce', () => {
    const w = coteau();
    // au flanc : trop raide pour la route ordinaire, pas pour les lacets
    const s = w.cellSlope(24, 30);
    expect(s).toBeGreaterThanOrEqual(ROAD_SLOPE);
    expect(s).toBeLessThan(SWITCH_SLOPE);
    expect(w.canRoad(24, 30)).toBe(false);
    expect(w.canRoad(24, 30, true)).toBe(true);
    // de la plaine jusqu'au plateau
    const p = planRoad(w, 24.5, 38.5, 24.5, 22.5);
    expect(p.why).toBeNull();
    expect(w.cellAvg(24, 22) - w.cellAvg(24, 38)).toBeGreaterThan(8);
    // le tracé serpente : bien plus long que la droite, et sa pente, mesurée case après case, reste douce
    const c = sampleCurve(p.pts);
    let len = 0, worst = 0;
    for (let i = 0; i + 2 < c.length; i += 2) len += Math.hypot(c[i + 2] - c[i], c[i + 3] - c[i + 1]);
    // (sur un tronçon de dix pas d'échantillon, mesuré le long de la route : un virage serré n'est pas une montée)
    for (let i = 0; i + 21 < c.length; i += 2) {
      let run = 0;
      for (let j = i; j < i + 20; j += 2) run += Math.hypot(c[j + 2] - c[j], c[j + 3] - c[j + 1]);
      worst = Math.max(worst, Math.abs(ground(w, c[i + 20], c[i + 21]) - ground(w, c[i], c[i + 1])) / Math.max(run, 0.5));
    }
    expect(len).toBeGreaterThan(1.5 * 16);
    expect(worst).toBeLessThanOrEqual(LACET_GRADE * 1.8);
    // au moins une épingle : le tracé repart dans l'autre sens
    const xs = p.pts.filter((_, i) => i % 2 === 0);
    let turns = 0, dir = 0;
    for (let i = 1; i < xs.length; i++) { const d = Math.sign(Math.round((xs[i] - xs[i - 1]) * 10)); if (d && dir && d !== dir) turns++; if (d) dir = d; }
    expect(turns).toBeGreaterThanOrEqual(1);
    // posée, la route a toutes ses cases ; le relief retouché à côté ne l'efface pas
    expect(w.addCurve(p.pts)).toBe(p.cells.length);
    for (const k of p.cells) expect(w.road[k]).toBe(1);
    w.sanitize(0, 0, N - 1, N - 1);
    for (const k of p.cells) expect(w.road[k]).toBe(1);
  });

  it('une paroi (pente au-delà des lacets) reste refusée ; une pente douce garde son tracé droit', () => {
    const w = coteau(4, 12);
    expect(w.cellSlope(24, 32)).toBeGreaterThanOrEqual(SWITCH_SLOPE);
    expect(planRoad(w, 24.5, 38.5, 24.5, 26.5).why).not.toBeNull();
    const d = coteau(0.6, 5);
    const p = planRoad(d, 24.5, 40.5, 24.5, 24.5);
    expect(p.why).toBeNull();
    for (let i = 0; i < p.pts.length; i += 2) expect(p.pts[i]).toBeCloseTo(24.5);
  });
});
