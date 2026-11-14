import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Traffic } from '../src/render/traffic';
import { Building } from '../src/build/catalog';

/** Une boucle de routes avec une traverse, posée telle quelle sur le relief (côtes comprises), et une écurie */
function roads() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const cx = N / 2, cz = N / 2;
  const put = (x: number, z: number) => { if (w.inMain(x, z)) w.road[w.ci(x, z)] = 1; };
  for (let x = cx - 12; x <= cx + 12; x++) { put(x, cz - 8); put(x, cz + 8); put(x, cz); }
  for (let z = cz - 8; z <= cz + 8; z++) { put(cx - 12, z); put(cx + 12, z); }
  w.buildings.set(99999, { id: 99999, kind: 'stable', x: cx, z: cz + 2, rot: 0 } as unknown as Building);
  w.version++;
  return w;
}

/** Emprise au sol d'un attelage (un peu rentrée) : charrette derrière, cheval devant ; demi-largeur 0,1 */
function corners(c: { x: number; z: number; heading: number }) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  return [[-0.1, -0.25], [0.1, -0.25], [0.1, 0.4], [-0.1, 0.4]].map(([s, a]) => [c.x + fx * a + fz * s, c.z + fz * a - fx * s]);
}
/** Deux emprises se recouvrent (axes séparateurs) */
function overlap(a: { x: number; z: number; heading: number }, b: { x: number; z: number; heading: number }) {
  const ca = corners(a), cb = corners(b);
  for (const h of [a.heading, b.heading]) for (const [ax, az] of [[Math.sin(h), Math.cos(h)], [Math.cos(h), -Math.sin(h)]]) {
    const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

type Cart = { x: number; z: number; heading: number; i: number; path: number[]; rig?: { root: { position: { y: number }; rotation: { x: number } } } | null };

describe('charrettes', () => {
  it('avancent toujours selon leur cap (jamais de côté ni à reculons), restent posées sur la route et arrivent au bout', () => {
    const w = roads(), t = new Traffic(w);
    const carts = () => (t as unknown as { vehicles: Cart[] }).vehicles;
    let moves = 0, sideways = 0, worstLift = 0, done = 0;
    const last = new Map<Cart, { x: number; z: number; i: number; stuck: number }>(); // stuck : chemin fait sans atteindre la cible
    let stuck = 0, close = 0, still = 0;
    const pair = new Map<string, number>();
    const idle = new Map<Cart, number>();
    for (let f = 0; f < 6000; f++) {
      t.update(1 / 30, 12, 2, 60);
      // passé le départ, deux attelages ne restent jamais l'un dans l'autre (au plus un frôlement bref, deux demi-tours qui se
      // croisent et dont l'un passe en priorité)
      if (f > 300) carts().forEach((a, ia) => carts().forEach((b, ib) => {
        if (ib <= ia) return;
        const key = ia + ':' + ib, n = overlap(a, b) ? (pair.get(key) ?? 0) + 1 : 0;
        pair.set(key, n);
        close = Math.max(close, n / 30);
      }));
      for (const v of carts()) {
        const p = last.get(v), still0 = !!p && p.x === v.x && p.z === v.z;
        if (p) {
          const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz);
          if (d > 1e-5) {
            moves++;
            // le pas fait avec le cap de cette image : produit scalaire positif, écart latéral nul
            const along = dx * Math.sin(v.heading) + dz * Math.cos(v.heading), side = Math.abs(dx * Math.cos(v.heading) - dz * Math.sin(v.heading));
            if (along <= 0 || side > d * 0.05) sideways++;
          }
          if (v.i !== p.i) { p.stuck = 0; if (v.i < p.i) done++; } else p.stuck += Math.hypot(v.x - p.x, v.z - p.z);
          stuck = Math.max(stuck, p.stuck);
          p.x = v.x; p.z = v.z; p.i = v.i;
        } else last.set(v, { x: v.x, z: v.z, i: v.i, stuck: 0 });
        // en route, jamais immobile longtemps (une file attend au plus celui qui fait halte devant elle)
        const moving = v.i < v.path.length;
        idle.set(v, moving && still0 ? (idle.get(v) ?? 0) + 1 / 30 : 0);
        still = Math.max(still, idle.get(v)!);
        // les roues touchent le sol : le repère de l'attelage reste au ras du relief sous l'essieu
        if (v.rig) worstLift = Math.max(worstLift, Math.abs(v.rig.root.position.y + 0.16 * Math.sin(v.rig.root.rotation.x) - w.surfaceAt(v.x - Math.sin(v.heading) * 0.16, v.z - Math.cos(v.heading) * 0.16)));
      }
    }
    expect(carts().length).toBeGreaterThan(2);
    expect(moves).toBeGreaterThan(1000);
    expect(sideways).toBe(0);
    // pas de charrette qui tourne en rond autour d'un point de passage
    expect(stuck).toBeLessThan(2.5);
    expect(done).toBeGreaterThan(0);
    expect(close).toBeLessThan(2.5);
    expect(still).toBeLessThan(15);
    expect(worstLift).toBeLessThan(0.08);
  });
});
