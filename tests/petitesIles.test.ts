import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { ARCH_N, archLayout, smallIsleCells } from '../src/world/archipelago';
import { onRival } from '../src/sim/diplomacy';
import { landOf, smallIsleAt } from '../src/sim/allyLand';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot } from '../src/build/placement';
import { zoneOf } from '../src/world/concession';

/**
 * Les petites îles de l'archipel se bâtissent (demande de l'auteur du 27 nov. 2026 : la grande île entre l'allié et le rival),
 * dès l'archipel ouvert, allié choisi ou non
 */

let cached: World | null = null;
/** L'archipel de la graine 11 (carte de 384), sans allié */
function archipel() {
  if (!cached) {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    w.updateVis();
    cached = w;
  }
  cached.diplo.ally = null;
  cached.diplo.met = ['orient', 'asie'];
  return cached;
}

/** La petite île la plus proche du milieu des deux îles rivales : celle du bras de mer */
function middle(w: World) {
  const [a, b] = w.isles!.rivals, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  return w.isles!.small.map((q, i) => ({ q, i, d: Math.hypot(q.x - mx, q.z - mz) })).sort((p, q) => p.d - q.d)[0];
}

/** Les cases de terre ferme d'une petite île */
function landOfIsle(w: World, i: number) {
  const out: [number, number][] = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (smallIsleAt(w, x, z) === i && w.cellMin(x, z) > 0.3) out.push([x, z]);
  return out;
}

/** Première place où ce bâtiment se pose sur la petite île `i` */
function spotOn(w: World, i: number, kind: 'house' | 'harbor' | 'farm') {
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (smallIsleAt(w, x, z) === i && w.canPlace(kind, x, z) === null) return [x, z] as const;
  return null;
}

describe('les petites îles se bâtissent', () => {
  it('chaque petite île a sa terre et l’eau qui la borde, jamais une case des îles rivales ni de l’île principale', () => {
    for (const seed of [3, 11, 27, 40, 58]) {
      const lay = archLayout(seed, ARCH_N), m = smallIsleCells(lay, seed, ARCH_N), f = lay.main;
      expect(lay.small.length).toBeGreaterThan(0);
      const count = lay.small.map(() => 0);
      for (let k = 0; k < m.length; k++) {
        if (m[k] < 0) continue;
        count[m[k]]++;
        const x = k % ARCH_N, z = Math.floor(k / ARCH_N);
        expect(x >= f.x && z >= f.z && x < f.x + f.n && z < f.z + f.n).toBe(false);
        expect(lay.rivals.some((r) => onRival(r, x + 0.5, z + 0.5))).toBe(false);
      }
      // (rayon 16 à 22 : de l'ordre d'un millier de cases, plus l'eau du bord)
      for (const c of count) expect(c).toBeGreaterThan(600);
    }
  });

  it('dès l’archipel ouvert, sans allié : la terre de la grande île du milieu se bâtit, se trace et se sculpte', () => {
    const w = archipel(), { i } = middle(w), land = landOfIsle(w, i);
    expect(land.length).toBeGreaterThan(500);
    for (const [x, z] of land.slice(0, 80)) { expect(w.playable(x, z), `${x},${z}`).toBe(true); expect(w.playWhy(x, z)).toBeNull(); }
    const road = land.find(([x, z]) => w.canRoad(x, z));
    expect(road).toBeTruthy();
    expect(landOf(w, land[0][0], land[0][1])).toBe(i + 1);
    // toutes les petites îles, pas seulement celle du milieu
    w.isles!.small.forEach((_, j) => expect(landOfIsle(w, j).some(([x, z]) => w.playable(x, z))).toBe(true));
  });

  it('une maison, une ferme et un port s’y posent, avec ou sans allié', () => {
    const w = archipel(), { i } = middle(w);
    for (const ally of [null, 'orient', 'asie'] as const) {
      w.diplo.ally = ally;
      for (const kind of ['house', 'farm', 'harbor'] as const) expect(spotOn(w, i, kind), `${kind} (${ally})`).not.toBeNull();
    }
  });

  it('le large et l’île rivale restent interdits, on le dit', () => {
    const w = archipel();
    w.diplo.ally = 'orient';
    const asie = w.isles!.rivals.find((r) => r.people === 'asie')!;
    const [x, z] = [Math.floor(asie.x), Math.floor(asie.z)];
    expect(w.playable(x, z)).toBe(false);
    expect(w.playWhy(x, z)).toMatch(/petites îles libres/);
    // en pleine mer, loin de toute île
    let sea: [number, number] | null = null;
    for (let z0 = 8; z0 < N - 8 && !sea; z0 += 7) for (let x0 = 8; x0 < N - 8 && !sea; x0 += 7)
      if (!w.inMain(x0, z0) && w.cellMin(x0, z0) < -0.8 && smallIsleAt(w, x0, z0) < 0 && !w.isles!.rivals.some((r) => onRival(r, x0, z0)) && !w.isles!.small.some((q) => Math.hypot(q.x - x0, q.z - z0) < q.r * 2)) sea = [x0, z0];
    expect(sea).not.toBeNull();
    expect(w.playable(sea![0], sea![1])).toBe(false);
  });

  it('les routes automatiques restent sur la petite île, même avec des routes chez l’allié', () => {
    const w = archipel(), { i } = middle(w);
    // un bout de route dans la concession : un autre réseau, de l'autre côté de la mer
    w.diplo.ally = 'orient';
    const zone = zoneOf(w, 'orient')!;
    const c = [...zone.cells].find((k) => w.canRoad(k % N, Math.floor(k / N)))!;
    w.setRoad(c % N, Math.floor(c / N), true);
    const [hx, hz] = spotOn(w, i, 'harbor')!;
    const port = w.place('harbor', hx, hz, facingRoadRot(w, 'harbor', hx, hz, 0), true, 2, false)!;
    let house = null as ReturnType<World['place']> | null;
    for (let r = 4; r < 16 && !house; r++) for (let dz = -r; dz <= r && !house; dz++) for (let dx = -r; dx <= r && !house; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dz)) === r && smallIsleAt(w, hx + dx, hz + dz) === i && w.canPlace('house', hx + 1 + dx, hz + 1 + dz) === null) house = w.place('house', hx + 1 + dx, hz + 1 + dz, facingRoadRot(w, 'house', hx + 1 + dx, hz + 1 + dz, 0), true, 2, false);
    expect(house).toBeTruthy();
    const laid = autoRoad(w, port) + autoRoad(w, house!);
    expect(laid).toBeGreaterThan(0);
    for (let k = 0; k < w.road.length; k++) if (w.road[k] && k !== c) expect(smallIsleAt(w, k % N, Math.floor(k / N))).toBe(i);
    for (const b of [house!, port]) w.removeBuilding(b.id);
    w.road.fill(0);
  });

  it('une sauvegarde avec un bâtiment sur la petite île se recharge, il y reste', () => {
    const w = archipel(), { i } = middle(w);
    const [x, z] = spotOn(w, i, 'house')!;
    const b = w.place('house', x, z, 0, true, 2, false)!;
    const json = JSON.parse(JSON.stringify(w.toJSON()));
    w.removeBuilding(b.id);
    // (la graine n'est pas dans la sauvegarde du monde : le jeu la lui donne avant)
    const v = new World();
    v.seed = w.seed;
    v.fromJSON(json);
    const back = [...v.buildings.values()].find((q) => q.kind === 'house' && q.x === x && q.z === z);
    expect(back).toBeTruthy();
    expect(smallIsleAt(v, x, z)).toBe(i);
  });
});
