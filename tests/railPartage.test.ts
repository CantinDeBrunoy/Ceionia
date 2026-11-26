import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import type { KindId } from '../src/build/catalog';
import { Agents } from '../src/sim/agents';
import { Railway, snapOnto, SNAP_FREE } from '../src/sim/railway';

/**
 * Les lignes reprennent les voies posées (retour de l'auteur, 26 nov. 2026) : le tracé automatique d'une nouvelle ligne passait
 * à côté d'une voie existante, et des rails posés sur des rails faisaient une double voie
 */
const line = (x0: number, z0: number, x1: number, z1: number, n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n] as [number, number]);
const dist = (p: [number, number], L: [number, number][]) => {
  let d = Infinity;
  for (let j = 0; j + 1 < L.length; j++) {
    const [ax, az] = L[j], dx = L[j + 1][0] - ax, dz = L[j + 1][1] - az, f = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(p[0] - ax - dx * f, p[1] - az - dz * f));
  }
  return d;
};

describe('le rail reprend les voies déjà posées', () => {
  it('un tracé qui longe une voie à côté s’y colle, sauf près des quais ; un croisement ne se colle pas', () => {
    const old = line(0, 0, 20, 0);
    const near = snapOnto(line(0, 0.4, 20, 0.4), [old]);
    for (const p of near) if (p[0] > SNAP_FREE + 0.1 && p[0] < 20 - SNAP_FREE - 0.1) expect(p[1]).toBeCloseTo(0, 5);
    expect(near[0][1]).toBeCloseTo(0.4);
    const cross = line(10, -10, 10, 10);
    expect(snapOnto(cross, [old])).toEqual(cross);
    // loin de toute voie : rien ne bouge
    const far = line(0, 5, 20, 5);
    expect(snapOnto(far, [old])).toEqual(far);
  });

  it('une ligne entre deux gares voisines de celles d’une autre ligne reprend sa voie au lieu d’en poser une à côté', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    const rail = new Railway(w, new Agents(w), () => 0.3);
    const spot = (kind: KindId, x0: number, z0: number): [number, number] => {
      for (let r = 0; r < 30; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx, z = z0 + dz;
        if (Math.max(Math.abs(dx), Math.abs(dz)) === r && x > 5 && z > 5 && x < N - 6 && z < N - 6 && w.canPlace(kind, x, z) === null) return [x, z];
      }
      throw new Error('pas de place');
    };
    // A et C côte à côte, B et D côte à côte, loin : la ligne C–D longe la ligne A–B
    const ratios: number[] = [];
    for (const [ax, az, dx, dz] of [[40, 60, 1, 0], [60, 40, 0, 1], [50, 50, 1, 1], [100, 90, -1, 0], [90, 110, 0, -1]] as [number, number, number, number][]) {
      const a = w.place('station', ...spot('station', ax, az), 0, true, 3, false);
      const b = w.place('station', ...spot('station', ax + dx * 26, az + dz * 26), 0, true, 3, false);
      const c = w.place('station', ...spot('station', ax + dz * 4, az + dx * 4), 0, true, 3, false);
      const d = w.place('station', ...spot('station', ax + dx * 26 + dz * 4, az + dz * 26 + dx * 4), 0, true, 3, false);
      const l1 = rail.addLine([a.id, b.id]), l2 = rail.addLine([c.id, d.id]);
      if (!rail.trains.get(l1.id)!.why && !rail.trains.get(l2.id)!.why) {
        const segs = rail.network().segs, s1 = segs.find((g) => g.a === a.id || g.b === a.id)!, s2 = segs.find((g) => g.a === c.id || g.b === c.id)!;
        ratios.push(s2.pts.filter((p) => dist(p, s1.pts) < 0.02).length / s2.pts.length);
      }
      for (const l of [l1, l2]) rail.removeLine(l.id);
      for (const s of [a, b, c, d]) w.removeBuilding(s.id);
    }
    expect(ratios.length).toBeGreaterThanOrEqual(2);
    // la plupart reprennent une bonne part de la voie de la première
    expect(ratios.filter((r) => r > 0.3).length, ratios.map((r) => r.toFixed(2)).join(' ')).toBeGreaterThanOrEqual(Math.ceil(ratios.length / 2));
  });
});
