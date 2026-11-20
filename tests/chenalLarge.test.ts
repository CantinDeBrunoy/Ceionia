import { it, expect, afterAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { ARCH_N, MAIN_N, archLayout } from '../src/world/archipelago';
import { expandWorld } from '../src/world/expand';
import { shipRoute } from '../src/render/transports';

/**
 * Le chenal des navires sur une carte agrandie où l'île principale touche un bord (retour de l'auteur, 20 nov. 2026 : les
 * navires de ses ports faisaient des allers-retours dans un petit bras de mer, leur chenal visait le bord de carte à 14 cases).
 * Depuis la côte de ce côté-là, chaque chenal va loin, finit en pleine mer, ne passe que sur l'eau et sous aucun pont
 */
afterAll(() => setMapSize(192));

it('les navires partent vers la pleine mer, même quand l’île touche le bord de la carte', { timeout: 120000 }, () => {
  // une graine où le cadre de l'île principale touche un bord
  let seed = 1, f = archLayout(seed, ARCH_N).main;
  const edge = (m: typeof f) => Math.min(m.x, m.z, ARCH_N - m.x - m.n, ARCH_N - m.z - m.n);
  while (edge(f) > 8 && seed < 400) f = archLayout(++seed, ARCH_N).main;
  expect(edge(f), 'aucune graine dont l’île touche un bord').toBeLessThanOrEqual(8);
  setMapSize(MAIN_N);
  const old = new World();
  old.seed = seed;
  newWorld(old, CONTINENT, seed, GEN);
  const d = expandWorld(JSON.parse(JSON.stringify(old.toJSON())), CONTINENT, seed);
  const w = new World();
  w.seed = seed;
  w.fromJSON(JSON.parse(JSON.stringify(d)));
  w.updateVis();
  expect(N).toBe(ARCH_N);
  // des quais sur la côte de l'île, du côté du bord le plus proche : une case d'eau peu profonde contre la terre
  const side = [f.x, f.z, ARCH_N - f.x - f.n, ARCH_N - f.z - f.n].indexOf(edge(f));
  const near = (x: number, z: number) => [x - f.x, z - f.z, f.x + f.n - x, f.z + f.n - z][side] < 40;
  const land = (x: number, z: number) => w.inCells(x, z) && w.cellAvg(x, z) > 0.05;
  const berths: [number, number, number, number][] = [];
  for (let z = f.z; z < f.z + f.n && berths.length < 400; z += 3) for (let x = f.x; x < f.x + f.n; x += 3) {
    if (!near(x, z) || !w.inCells(x, z) || w.cellAvg(x, z) > -0.1 || w.lake[w.ci(x, z)]) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (land(x - dx, z - dz)) { berths.push([x + 0.5, z + 0.5, dx, dz]); break; }
  }
  expect(berths.length).toBeGreaterThan(5);
  // une poche d'eau fermée (moins de 400 cases d'eau reliées)
  const pocket = (x0: number, z0: number) => {
    const seen = new Set([w.ci(x0, z0)]), q = [[x0, z0]];
    for (let h = 0; h < q.length && seen.size < 400; h++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = q[h][0] + dx, z = q[h][1] + dz;
      if (!w.inCells(x, z) || seen.has(w.ci(x, z)) || w.cellAvg(x, z) > -0.08) continue;
      seen.add(w.ci(x, z)); q.push([x, z]);
    }
    return seen.size < 400;
  };
  let checked = 0;
  const bad: string[] = [];
  for (let i = 0; i < berths.length; i += Math.max(1, Math.floor(berths.length / 12))) {
    const [x, z, dx, dz] = berths[i];
    if (pocket(Math.floor(x), Math.floor(z))) continue; // une anse fermée : le navire n'a nulle part où aller
    const r = shipRoute(w, [x, z], dx, dz);
    checked++;
    const [ex, ez] = r[r.length - 1], far = Math.hypot(ex - x, ez - z);
    // loin du quai, et en pleine mer : pas de terre à 6 cases du bout
    let coast = Infinity;
    for (let oz = -8; oz <= 8; oz++) for (let ox = -8; ox <= 8; ox++) if (land(Math.floor(ex) + ox, Math.floor(ez) + oz)) coast = Math.min(coast, Math.hypot(ox, oz));
    // rien que de l'eau, sous aucun pont
    const dry = r.filter(([px, pz]) => land(Math.floor(px), Math.floor(pz))).length;
    const bridge = r.filter(([px, pz]) => w.bridgeY(Math.floor(px), Math.floor(pz)) !== null).length;
    if (far < 25 || coast < 6 || dry || bridge) bad.push(`quai ${x},${z} : fin à ${far.toFixed(0)} cases, côte à ${coast.toFixed(0)}, ${dry} points sur terre, ${bridge} sous un pont`);
  }
  expect(checked).toBeGreaterThan(3);
  expect(bad.join('\n')).toBe('');
});
