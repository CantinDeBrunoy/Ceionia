import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, MOUNTAIN_H, mergeVia } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { rasterize, sampleCurve } from '../src/world/curves';
import { planRoad } from '../src/build/freeRoad';
import { Railway } from '../src/sim/railway';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';

/** Le continent, toujours la même graine : les tests ne dépendent pas du hasard */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/**
 * Une bande de basses terres libres de `len` cases sur `rows`, d'ouest en est (x, z de son coin) : défrichée et aplanie à sa
 * hauteur moyenne (le continent change de forme d'une version du générateur à l'autre)
 */
function flatStrip(w: World, len: number, rows = 7) {
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

/** Distance d'un point à la ligne d'un tronçon de voie */
function distTo(pts: [number, number][], x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l = bx * bx + bz * bz;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l)) : 0;
    d = Math.min(d, Math.hypot(x - ax - bx * t, z - az - bz * t));
  }
  return d;
}

/** Les cases de route forment-elles un chemin d'une case à l'autre (4-voisinage) ? */
function connected(w: World, a: number, b: number) {
  const seen = new Set([a]), q = [a];
  for (let i = 0; i < q.length; i++) {
    if (q[i] === b) return true;
    const x = q[i] % N, z = Math.floor(q[i] / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = w.ci(x + dx, z + dz);
      if (w.inCells(x + dx, z + dz) && w.road[k] && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  return false;
}

describe('routes en courbe', () => {
  it('une ligne devient une suite de cases voisines par un côté, qui couvre chacun de ses points', () => {
    const n = 40;
    for (const pts of [[2.5, 2.5, 20.5, 14.5], [3.2, 30.1, 9.9, 4.4, 30.7, 12.3], [5, 5, 15, 15], [1.5, 1.5, 1.5, 9.5]]) {
      const cells = rasterize(pts, n);
      for (let i = 1; i < cells.length; i++) {
        const a = cells[i - 1], b = cells[i];
        expect(Math.abs((a % n) - (b % n)) + Math.abs(Math.floor(a / n) - Math.floor(b / n))).toBe(1);
      }
      const set = new Set(cells), s = sampleCurve(pts);
      for (let i = 0; i < s.length; i += 2) expect(set.has(Math.floor(s[i + 1]) * n + Math.floor(s[i]))).toBe(true);
      expect(cells[0]).toBe(Math.floor(pts[1]) * n + Math.floor(pts[0]));
    }
    // une diagonale exacte, qui passe par les coins des cases, prend une case de plus à chaque coin
    expect(rasterize([0.5, 0.5, 3.5, 3.5], n).length).toBe(7);
    // hors de la carte, rien
    expect(rasterize([-5, -5, -1, -2], n)).toEqual([]);
  });

  it('de A à B, une belle courbe qui contourne un bâtiment, sur des cases de route ordinaires', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 18);
    // une maison au milieu du chemin, entre A et B
    const house = w.place('house', x + 8, z + 3, 0, false, 1, false);
    const plan = planRoad(w, x + 1.5, z + 3.5, x + 16.5, z + 3.5);
    expect(plan.why).toBeNull();
    // la ligne part du centre de la case de A et arrive au centre de celle de B, en douceur (pas de coude brusque)
    expect(plan.pts.slice(0, 2)).toEqual([x + 1.5, z + 3.5]);
    expect(plan.pts.slice(-2)).toEqual([x + 16.5, z + 3.5]);
    const s = sampleCurve(plan.pts, 0.25);
    for (let i = 2; i + 3 < s.length; i += 2) {
      const a = Math.atan2(s[i + 1] - s[i - 1], s[i] - s[i - 2]), b = Math.atan2(s[i + 3] - s[i + 1], s[i + 2] - s[i]);
      expect(Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))).toBeLessThan(0.8);
    }
    // aucune case de la route sur la maison
    expect(plan.cells.every((k) => w.occ[k] === 0)).toBe(true);
    const n = w.addCurve(plan.pts);
    expect(n).toBe(plan.cells.length);
    expect(connected(w, w.ci(x + 1, z + 3), w.ci(x + 16, z + 3))).toBe(true);
    // les trajets suivent la ligne : le point de passage d'une case est sur la courbe
    for (const k of plan.cells) {
      const at = w.passPoint([k], 0);
      expect(Math.floor(at[0])).toBeGreaterThanOrEqual((k % N) - 1);
      let d = 9;
      for (let i = 0; i < s.length; i += 2) d = Math.min(d, Math.hypot(s[i] - at[0], s[i + 1] - at[1]));
      expect(d).toBeLessThan(0.2);
    }
    expect(w.buildings.get(house.id)).toBeDefined();
  });

  it('refuse clairement ce qui ne passe pas : trop loin, sur un bâtiment', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 10);
    expect(planRoad(w, 5.5, 5.5, 100.5, 100.5).why).toMatch(/Trop loin/);
    w.place('house', x + 6, z + 3, 0, false, 1, false);
    expect(planRoad(w, x + 0.5, z + 3.5, x + 6.5, z + 3.5).why).toMatch(/bâtiment/);
  });

  it('se sauvegarde, s’annule, et une ancienne partie n’en a pas', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 14);
    const before = w.snapshot();
    const plan = planRoad(w, x + 1.5, z + 1.5, x + 12.5, z + 5.5);
    w.addCurve(plan.pts);
    expect(w.curves.length).toBe(1);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const w2 = new World();
    w2.fromJSON(d);
    expect(w2.curves.map((c) => c.pts)).toEqual(w.curves.map((c) => c.pts));
    expect([...w2.curveCells().keys()]).toEqual([...w.curveCells().keys()]);
    for (const k of plan.cells) expect(w2.road[k]).toBe(1);
    // annuler : la route et sa courbe s'en vont
    w.restore(before);
    expect(w.curves.length).toBe(0);
    expect(plan.cells.some((k) => w.road[k])).toBe(false);
    // une courbe dont il ne reste aucune route s'oublie à la sauvegarde ; une ancienne sauvegarde n'a pas de courbes
    w2.curveCells().forEach((_, k) => w2.setRoad(k % N, Math.floor(k / N), false));
    expect(w2.toJSON().curves).toEqual([]);
    delete d.curves;
    const w3 = new World();
    w3.fromJSON(d);
    expect(w3.curves).toEqual([]);
    expect(w3.curveAt(plan.cells[0])).toBeUndefined();
  });
});

describe('voie ferrée tracée à la main', () => {
  it('passe par les points choisis, se sauvegarde, refuse un point sur un obstacle', () => {
    const w = continent();
    const [x, z] = flatStrip(w, 22, 12);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const rail = new Railway(w, new Agents(w), ex, () => 100, () => 0.3);
    const a = w.place('station', x + 1, z + 4, 0, false, 3, false), b = w.place('station', x + 18, z + 4, 0, false, 3, false);
    const line = rail.addLine([a.id, b.id]), tr = rail.trains.get(line.id)!;
    expect(tr.why).toBeNull();
    // la voie posée d'elle-même file tout droit entre les deux quais, loin du point qu'on va choisir
    const auto = rail.network().segs[0], px = x + 10, pz = z + 10;
    expect(distTo(auto.pts, px + 0.5, pz + 0.5)).toBeGreaterThan(2.5);
    // un point de passage au sud : la voie y passe, et le train roule toujours
    rail.setStops(line.id, [a.id, b.id], [[w.ci(px, pz)]]);
    expect(tr.why).toBeNull();
    const via = rail.network().segs.find((g) => g.a === Math.min(a.id, b.id))!;
    expect(distTo(via.pts, px + 0.5, pz + 0.5)).toBeLessThan(0.8);
    for (const [vx, vz] of via.pts) expect(w.occ[w.ci(Math.floor(vx), Math.floor(vz))] === 0 || w.occ[w.ci(Math.floor(vx), Math.floor(vz))] === a.id || w.occ[w.ci(Math.floor(vx), Math.floor(vz))] === b.id).toBe(true);
    for (let t = 0; t < 200; t++) rail.update(0.5);
    expect(tr.why).toBeNull();
    // l'éditeur voit le même tracé, dans un sens comme dans l'autre
    const plan = rail.plan(b, a, [w.ci(px, pz)])!;
    expect(plan.seg).not.toBeNull();
    expect(distTo(plan.seg!.pts, px + 0.5, pz + 0.5)).toBeLessThan(0.8);
    // sauvegardé avec la ligne ; une ancienne sauvegarde (sans points) garde la voie posée d'elle-même
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const w2 = new World();
    w2.fromJSON(d);
    expect(w2.lines[0].via).toEqual([[w.ci(px, pz)]]);
    delete d.lines[0].v;
    const w3 = new World();
    w3.fromJSON(d);
    expect(w3.lines[0].via).toBeUndefined();
    expect(w3.lines[0].stops.length).toBe(2);
    // un point posé sur une maison : ce morceau ne passe pas, la ligne le dit clairement
    const house = w.place('house', x + 10, z + 1, 0, false, 3, false), hk = w.ci(house.x, house.z);
    const bad = rail.plan(a, b, [hk])!;
    expect(bad.seg).toBeNull();
    expect(bad.pieces).toEqual([null, null]);
    rail.setStops(line.id, [a.id, b.id], [[hk]]);
    expect(tr.why).toMatch(/points choisis/);
    // retour au tracé automatique
    rail.setStops(line.id, [a.id, b.id]);
    expect(tr.why).toBeNull();
    expect(w.lines[0].via).toBeUndefined();
  });

  it('un arrêt disparu : les points de passage des deux tronçons se suivent', () => {
    expect(mergeVia([[1], [2, 3], [4]], [0, 2, 3])).toEqual([[1, 2, 3], [4]]);
    expect(mergeVia([[], []], [0, 1, 2])).toBeUndefined();
    expect(mergeVia(undefined, [0, 1])).toBeUndefined();
  });
});
