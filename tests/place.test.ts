import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { autoRoad } from '../src/build/autoroads';
import { doorCells } from '../src/build/placement';
import { KINDS, hasDoor, sizeOf } from '../src/build/catalog';
import { costOf } from '../src/sim/economy';

/** Le continent des tests, toujours la même graine */
function continent(seed = 2026) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed);
  w.updateVis();
  return w;
}

/** Un emplacement plat de la place du village (3 × 3), avec une marge libre de `m` cases tout autour */
function plazaSpot(w: World, m = 3): [number, number] {
  for (let z = 12; z < N - 12; z++)
    for (let x = 12; x < N - 12; x++) {
      let ok = true;
      for (let j = -m; j < 3 + m && ok; j++) for (let i = -m; i < 3 + m && ok; i++) ok = w.canPlace('house', x + i, z + j) === null && w.cellSlope(x + i, z + j) < 0.3;
      if (ok) return [x, z];
    }
  throw new Error('pas de place');
}

const cellsOf = (w: World, id: number) => [...w.occ.keys()].filter((k) => w.occ[k] === id).sort((a, b) => a - b);

describe('la place du village (3 × 3)', () => {
  it('est une place de 3 × 3, offerte en partie normale, et la première pose', () => {
    expect(KINDS.gather.size).toBe(3);
    // le forum, son amélioration, garde la même emprise
    expect(KINDS.forum.size).toBe(3);
    expect(costOf('gather', 0)).toBeNull();
    // en défi, elle coûte ce que coûtait le feu de camp d'une case
    expect(costOf('gather', 0, 'hard')).toEqual(costOf('lamp', 0, 'hard'));
  });

  it('n’a pas de porte : ni case réservée devant, ni chemin à elle ; on la rejoint de n’importe quel côté', () => {
    const w = continent();
    const [x, z] = plazaSpot(w);
    const g = w.place('gather', x, z, 0, true, 0, false);
    expect(hasDoor('gather')).toBe(false);
    for (let r = 0; r < 4; r++) expect(doorCells('gather', x, z, 3, r)).toEqual([]);
    // aucune case autour n'est « devant la porte »
    for (let i = -1; i <= 3; i++) for (const [cx, cz] of [[x + i, z - 1], [x + i, z + 3], [x - 1, z + i], [x + 3, z + i]]) expect(w.doorOf(cx, cz)).toBeUndefined();
    expect(autoRoad(w, g)).toBe(0);
    // une maison posée à l'est, un peu à l'écart : son chemin rejoint le bord de la place, sur ce côté-là
    const h = w.place('house', x + 6, z + 1, 3, true, 0, false);
    expect(autoRoad(w, h)).toBeGreaterThan(0);
    const roads = [...w.road.keys()].filter((k) => w.road[k]);
    expect(roads.some((k) => (k % N) === x + 3 && Math.floor(k / N) >= z && Math.floor(k / N) < z + 3)).toBe(true);
    // une maison collée contre la place, sur n'importe quel côté, reste possible
    expect(w.canPlace('house', x + 1, z - 1)).toBeNull();
    expect(w.canPlace('house', x - 1, z + 1)).toBeNull();
    expect(w.canPlace('house', x + 1, z + 3)).toBeNull();
  });

  it('une partie neuve offre 3 × 3 cases libres au milieu de la carte, où la vue se pose', () => {
    for (const seed of [2026, 1, 7, 42]) {
      const w = continent(seed);
      const [sx, sz] = w.startSpot();
      expect(w.canPlace('gather', sx, sz)).toBeNull();
      expect(Math.hypot(sx + 1.5 - N / 2, sz + 1.5 - N / 2)).toBeLessThan(12);
    }
  });
});

describe('les places des anciennes sauvegardes', () => {
  it('un feu de camp 1 × 1 grandit en 3 × 3 autour de lui, centré ; une place déjà en 3 × 3 ne bouge pas', () => {
    const w = continent();
    const [x, z] = plazaSpot(w);
    const d = w.toJSON();
    // une ancienne sauvegarde : sans la marque des places en 3 × 3
    delete d.plaza3;
    d.buildings.push(['gather', x + 1, z + 1, 0, 1, 0]);
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(d)));
    const g = [...w2.buildings.values()].find((b) => b.kind === 'gather')!;
    expect(g.small).toBeUndefined();
    expect([g.x, g.z]).toEqual([x, z]);
    expect(cellsOf(w2, g.id).length).toBe(9);
    expect(w2.losses).toEqual([]);
    // relue telle quelle : la place reste où elle est
    const w3 = new World();
    w3.fromJSON(JSON.parse(JSON.stringify(w2.toJSON())));
    const g3 = [...w3.buildings.values()].find((b) => b.kind === 'gather')!;
    expect([g3.x, g3.z, sizeOf(g3)]).toEqual([x, z, 3]);
  });

  it('cernée de maisons, elle reste en 1 × 1 sans chevaucher personne, puis grandit quand la place se libère', () => {
    const w = continent();
    const [x, z] = plazaSpot(w);
    // le feu de camp en (x + 1, z + 1), une maison sur chacune des huit cases autour
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (i !== 1 || j !== 1) w.place('house', x + i, z + j, 0, true, 0, false);
    const d = w.toJSON();
    delete d.plaza3;
    d.buildings.push(['gather', x + 1, z + 1, 0, 1, 0]);
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(d)));
    const g = [...w2.buildings.values()].find((b) => b.kind === 'gather')!;
    expect(g.small).toBe(true);
    expect(sizeOf(g)).toBe(1);
    expect(cellsOf(w2, g.id)).toEqual([w2.ci(x + 1, z + 1)]);
    expect([...w2.buildings.values()].filter((b) => b.kind === 'house').length).toBe(8);
    // la sauvegarde suivante le garde petit ; sans les maisons, il grandit au chargement d'après
    const d2 = JSON.parse(JSON.stringify(w2.toJSON()));
    expect(d2.plaza3).toBe(1);
    expect(d2.buildings.find((r: unknown[]) => r[0] === 'gather')[6]).toBe(1);
    d2.buildings = d2.buildings.filter((r: unknown[]) => r[0] !== 'house');
    const w3 = new World();
    w3.fromJSON(d2);
    const big = [...w3.buildings.values()].find((b) => b.kind === 'gather')!;
    expect(big.small).toBeUndefined();
    expect([big.x, big.z]).toEqual([x, z]);
  });
});

describe('les âges et les améliorations', () => {
  it('la place du village et le forum ont chacun leur propre ligne d’évolution', async () => {
    const { lineOf, UPGRADES } = await import('../src/build/catalog');
    expect(lineOf('gather')).toEqual(['gather']);
    expect(lineOf('forum')).toEqual(['forum']);
    expect(UPGRADES.some((u) => u.to === 'forum' || u.from === 'forum')).toBe(false);
  });
  it('l’acropole, le forum et le sénat ne se bâtissent plus après l’Antiquité', async () => {
    const { KINDS } = await import('../src/build/catalog');
    for (const k of ['acropolis', 'forum', 'senate'] as const) expect(KINDS[k].maxAge).toBe(1);
  });
});
