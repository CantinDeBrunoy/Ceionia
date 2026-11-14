import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Agents } from '../src/sim/agents';

/** Le continent, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Une bande de basses terres libres de `len` × `rows` cases, défrichée et aplanie (coin x, z) */
function flatStrip(w: World, len: number, rows: number) {
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.6 && !w.decor[w.ci(x, z)] && !w.occ[w.ci(x, z)] && !w.road[w.ci(x, z)] && !w.isWet(x, z)
    && w.cellAvg(x, z) > 0.5 && w.cellAvg(x, z) < MOUNTAIN_H - 0.6;
  for (let z = 12; z < N - rows - 12; z++)
    for (let x = 12; x < N - len - 12; x++) {
      let good = true;
      for (let dz = 0; dz < rows && good; dz++) for (let dx = 0; dx < len && good; dx++) good = ok(x + dx, z + dz);
      if (!good) continue;
      let h = 0;
      for (let dz = 0; dz <= rows; dz++) for (let dx = 0; dx <= len; dx++) h += w.h(x + dx, z + dz) / ((rows + 1) * (len + 1));
      for (let dz = 0; dz <= rows; dz++) for (let dx = 0; dx <= len; dx++) w.heights[w.vi(x + dx, z + dz)] = h;
      for (let dz = 0; dz < rows; dz++) for (let dx = 0; dx < len; dx++) w.setVeg(x + dx, z + dz, 0);
      w.updateVis();
      return [x, z];
    }
  throw new Error('pas de bande plate');
}

/** Un marcheur (membre d'expédition : il obéit sans flâner) mené de (x0, z0) à (x1, z1) ; sa trace, à chaque image */
function walk(w: World, ag: Agents, x0: number, z0: number, x1: number, z1: number) {
  (ag as unknown as { popTarget: number }).popTarget = 40;
  const [id] = ag.recruit(1)!;
  ag.partyPlace([id], x0, z0);
  ag.memberGo(id, x1, z1);
  const a = (ag as unknown as { agents: { id: number; x: number; z: number; heading: number }[] }).agents.find((b) => b.id === id)!;
  const trace: [number, number, number][] = [[a.x, a.z, a.heading]];
  for (let i = 0; i < 4000 && !ag.memberDone(id); i++) {
    ag.update(1 / 30, 12, 1, false, 0, 0);
    trace.push([a.x, a.z, a.heading]);
  }
  return { trace, done: ag.memberDone(id) };
}

/** Changements de cap de plus de 8° d'un échantillon à l'autre (tous les 0,2 s), et longueur parcourue */
function measure(trace: [number, number, number][]) {
  let turns = 0, len = 0;
  for (let i = 6; i < trace.length; i += 6) {
    let d = trace[i][2] - trace[i - 6][2];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > (8 * Math.PI) / 180) turns++;
  }
  for (let i = 1; i < trace.length; i++) len += Math.hypot(trace[i][0] - trace[i - 1][0], trace[i][1] - trace[i - 1][1]);
  return { turns, len };
}

/** Longueur du trajet de cases trouvé (de centre en centre), départ et arrivée compris */
function cellsLen(path: number[], x0: number, z0: number, x1: number, z1: number) {
  const p = [[x0, z0], ...path.map((c) => [(c % N) + 0.5, Math.floor(c / N) + 0.5]), [x1, z1]];
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}

const cellAt = (x: number, z: number) => Math.floor(z) * N + Math.floor(x);

describe('marche des habitants', () => {
  it('traverse un champ en biais tout droit, sans escalier', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 28, 10);
    w.place('house', x + 1, z + 1, 0, true, 1, false);
    const ag = new Agents(w);
    const { trace, done } = walk(w, ag, x + 2.5, z + 3.5, x + 26.5, z + 8.5);
    const m = measure(trace);
    expect(done).toBe(true);
    // avant : 15 changements de cap et 27,7 de chemin pour 24,5 à vol d'oiseau
    expect(m.turns).toBeLessThanOrEqual(2);
    expect(m.len).toBeLessThan(Math.hypot(24, 5) * 1.03);
  });

  it('contourne un mur de maisons sans le traverser, par un chemin plus court que celui des cases', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 28, 10);
    w.place('house', x + 1, z + 1, 0, true, 1, false);
    // un mur de maisons en travers, ouvert en bas
    for (let dz = 0; dz < 7; dz++) w.place('house', x + 14, z + dz, 0, true, 1, false);
    for (let dz = 0; dz < 7; dz++) expect(w.occ[w.ci(x + 14, z + dz)]).toBeGreaterThan(0);
    const ag = new Agents(w);
    const x0 = x + 3.5, z0 = z + 2.5, x1 = x + 25.5, z1 = z + 2.5;
    const cells = ag.findPath(cellAt(x0, z0), cellAt(x1, z1))!;
    const { trace, done } = walk(w, ag, x0, z0, x1, z1);
    expect(done).toBe(true);
    const home = cellAt(x + 1.5, z + 1.5), goal = cellAt(x1, z1);
    for (const [px, pz] of trace) {
      const c = cellAt(px, pz);
      if (c !== home && c !== goal) expect(w.occ[c]).toBe(0);
    }
    const m = measure(trace);
    // avant : 17 changements de cap ; deux virages francs (vers la brèche, puis vers le but), adoucis sur quelques échantillons
    expect(m.turns).toBeLessThanOrEqual(8);
    expect(m.len).toBeLessThanOrEqual(cellsLen(cells, x0, z0, x1, z1) + 0.05);
  });

  it('suit une route en courbe en son milieu', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 28, 10);
    w.place('house', x + 1, z + 1, 0, true, 1, false);
    const line = [x + 2, z + 8, x + 10, z + 3, x + 18, z + 7, x + 26, z + 2];
    expect(w.addCurve(line)).toBeGreaterThan(15);
    const ag = new Agents(w);
    const curve = w.curves[w.curves.length - 1].pts;
    const s: [number, number][] = [];
    for (let i = 0; i + 1 < curve.length; i += 2) s.push([curve[i], curve[i + 1]]);
    // de la courbe dessinée, au plus près
    const near = (px: number, pz: number) => {
      let d = Infinity;
      for (let i = 0; i + 1 < s.length; i++) {
        const [ax, az] = s[i], bx = s[i + 1][0] - ax, bz = s[i + 1][1] - az, l = bx * bx + bz * bz;
        const t = l ? Math.max(0, Math.min(1, ((px - ax) * bx + (pz - az) * bz) / l)) : 0;
        d = Math.min(d, Math.hypot(px - ax - bx * t, pz - az - bz * t));
      }
      return d;
    };
    const { trace, done } = walk(w, ag, x + 3.2, z + 7.4, x + 25.2, z + 2.6);
    expect(done).toBe(true);
    let worst = 0;
    for (const [px, pz] of trace.slice(15, -15)) worst = Math.max(worst, near(px, pz));
    expect(worst).toBeLessThan(0.5);
  });
});
