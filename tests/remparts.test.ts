import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { getModel } from '../src/render/models';
import { KINDS, DEFENSES, hasDoor, type KindId } from '../src/build/catalog';
import { traceRampart, layRampart, rampartCost, rampartMask, RAMPART_MAX } from '../src/build/rampart';
import { nodeKind } from '../src/render/ramparts';
import { WALL_N, WALL_E, WALL_S, WALL_W, gateAlongX } from '../src/render/hellBase';
import { isleOrigins } from '../src/build/zones';
import { costOf } from '../src/sim/economy';
import { computeCoverage } from '../src/sim/coverage';
import { villageBarracks } from '../src/world/portal';

/**
 * Les remparts du village et les bâtiments militaires hors de l'île : où ils se posent, le tracé libre des murs, un modèle
 * détaillé et distinct à chaque âge
 */

/** Une carte, le portail ouvert, et un coin de terre plate au village */
const setup = () => {
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.exp.done.push('portal');
  const [sx, sz] = w.startSpot();
  // (un replat de 9 × 9 autour du départ : tout s'y pose)
  for (let z = sz - 3; z <= sz + 6; z++) for (let x = sx - 3; x <= sx + 6; x++) w.heights[z * (N + 1) + x] = 1.5;
  for (let z = sz - 3; z < sz + 6; z++) for (let x = sx - 3; x < sx + 6; x++) w.veg[w.ci(x, z)] = 0;
  return { w, sx, sz };
};

describe('bâtiments militaires au village', () => {
  beforeAll(() => setMapSize(192));

  it('tour de garde, caserne, rempart et porte se posent au village et sur l’île ; rien d’autre ne change sur l’île', () => {
    const { w, sx, sz } = setup();
    expect(DEFENSES).toEqual(['watchtower', 'barracks', 'wall', 'gate']);
    for (const k of DEFENSES) expect(w.canPlace(k, sx, sz), k).toBeNull();
    const t = isleOrigins(w, 'watchtower')[0], g = isleOrigins(w, 'wall')[0];
    expect(t).toBeDefined(); expect(g).toBeDefined();
    expect(w.canPlace('house', t % N, Math.floor(t / N))).toMatch(/que des défenses/);
    // posés au village, ils y restent et ne comptent pas pour l'île
    const tower = w.place('watchtower', sx, sz, 0, true, 1, false);
    const camp = w.place('barracks', sx + 2, sz, 0, true, 1, false);
    expect(w.onPortalIsland(tower.x, tower.z)).toBe(false);
    expect(villageBarracks(w)).toBe(1);
    void camp;
  });

  it('refusés dans l’eau, sur un bâtiment, sur une route (sauf la porte, qui l’enjambe)', () => {
    const { w, sx, sz } = setup();
    let sea = -1;
    for (let k = 0; k < N * N && sea < 0; k++) if (w.cellAvg(k % N, Math.floor(k / N)) < -0.5) sea = k;
    expect(w.canPlace('wall', sea % N, Math.floor(sea / N))).toMatch(/eau|Hors/);
    w.place('house', sx, sz, 0, true, 1, false);
    expect(w.canPlace('wall', sx, sz)).toBe('Emplacement occupé');
    w.setRoad(sx + 3, sz, true);
    expect(w.canPlace('wall', sx + 3, sz)).toBe('Une route est déjà ici');
    expect(w.canPlace('watchtower', sx + 3, sz)).toBe('Une route est déjà ici');
    expect(w.canPlace('gate', sx + 3, sz)).toBeNull();
    // la porte posée sur la rue : la route reste, les passants passent dessous
    const gate = w.place('gate', sx + 3, sz, 0, false, 1, false);
    expect(w.road[w.ci(sx + 3, sz)]).toBe(1);
    w.removeBuilding(gate.id);
    expect(w.road[w.ci(sx + 3, sz)]).toBe(1);
    expect(w.occ[w.ci(sx + 3, sz)]).toBe(0);
  });

  it('ni porte ni chemin d’accès pour les remparts ; un pan est bon marché, gratuit en Facile', () => {
    expect(hasDoor('wall')).toBe(false);
    expect(hasDoor('gate')).toBe(false);
    expect(hasDoor('watchtower')).toBe(true);
    expect(costOf('wall', 2, 'easy')).toBeNull();
    const wall = costOf('wall', 2, 'normal')!, house = costOf('house', 2, 'normal')!;
    expect(wall.wood).toBeGreaterThan(0);
    expect(wall.wood).toBeLessThan(house.wood);
    expect(KINDS.wall.names[2]).toBe('Muraille');
    expect(KINDS.gate.names[5]).toBe('Porte à champ de force');
  });

  it('la tour de garde du village veille comme un poste de police (jauge Sécurité)', () => {
    const { w, sx, sz } = setup();
    w.place('house', sx, sz, 0, true, 1, false);
    expect(computeCoverage(w.buildings.values()).policeShare).toBe(0);
    w.place('watchtower', sx + 2, sz, 0, true, 1, false);
    expect(computeCoverage(w.buildings.values()).policeShare).toBe(1);
  });
});

describe('remparts : le tracé libre', () => {
  beforeAll(() => setMapSize(192));

  it('de A à B, case par case ; les routes sont sautées et le mur reprend derrière, la route reste', () => {
    const { w, sx, sz } = setup();
    for (let z = sz - 3; z < sz + 6; z++) w.setRoad(sx + 1, z, true);
    const t = traceRampart(w, [sx - 2 + 0.5, sz + 0.5], [sx + 4 + 0.5, sz + 0.5]);
    expect(t.cells.length).toBe(7);
    expect(t.why).toBeNull();
    expect(t.ok).toEqual([true, true, true, false, true, true, true]);
    expect(rampartCost(w, t, 1)).toBeNull();
    const r = layRampart(w, t, 1);
    expect(r).toEqual({ built: 6, skipped: 1, short: false });
    expect(w.road[w.ci(sx + 1, sz)]).toBe(1);
    expect(w.buildingAt(sx + 1, sz)).toBeUndefined();
    expect(w.buildingAt(sx, sz)?.kind).toBe('wall');
    expect(w.buildingAt(sx + 2, sz)?.kind).toBe('wall');
    // un second tracé qui repasse sur le premier ne repose rien ; une diagonale fait un escalier sans trou
    expect(layRampart(w, traceRampart(w, [sx - 2 + 0.5, sz + 0.5], [sx + 0.5, sz + 0.5]), 1).built).toBe(0);
    const d = traceRampart(w, [sx - 2 + 0.5, sz + 1.5], [sx - 2 + 3.5, sz + 4.5]);
    expect(d.cells.length).toBe(7);
    for (let i = 1; i < d.cells.length; i++) expect(Math.abs(d.cells[i][0] - d.cells[i - 1][0]) + Math.abs(d.cells[i][1] - d.cells[i - 1][1])).toBe(1);
    // trop long : refusé avec la raison
    expect(traceRampart(w, [0.5, 0.5], [RAMPART_MAX + 10.5, 0.5]).why).toMatch(/Trop long/);
  });

  it('en Normal, chaque pan se paie ; sans bois, le tracé s’arrête net', () => {
    const { w, sx, sz } = setup();
    w.difficulty = 'normal';
    const unit = costOf('wall', 1, 'normal')!;
    w.wood = unit.wood * 3; w.stone = 999;
    const t = traceRampart(w, [sx + 0.5, sz + 0.5], [sx + 5.5, sz + 0.5]);
    expect(rampartCost(w, t, 1)).toEqual({ wood: unit.wood * 6, stone: unit.stone * 6 });
    const r = layRampart(w, t, 1);
    expect(r.built).toBe(3);
    expect(r.short).toBe(true);
    expect(w.wood).toBe(0);
  });

  it('les pans se raccordent à leurs voisins (pan, porte, tour) ; une porte seule suit l’axe de la rue', () => {
    const { w, sx, sz } = setup();
    const a = w.place('wall', sx, sz, 0, false, 1, false);
    expect(rampartMask(w, a)).toBe(0);
    const b = w.place('wall', sx + 1, sz, 0, false, 1, false);
    const c = w.place('wall', sx + 1, sz + 1, 0, false, 1, false);
    expect(rampartMask(w, a)).toBe(WALL_E);
    expect(rampartMask(w, b)).toBe(WALL_W | WALL_S);
    expect(nodeKind(rampartMask(w, b))).toBe('corner');
    expect(nodeKind(WALL_E | WALL_W)).toBe('straight');
    expect(nodeKind(WALL_E)).toBe('end');
    expect(nodeKind(WALL_N | WALL_E | WALL_S)).toBe('junction');
    w.place('watchtower', sx + 1, sz + 2, 0, false, 1, false);
    expect(rampartMask(w, c) & WALL_S).toBe(WALL_S);
    // la porte en travers d'une rue nord-sud : le mur court d'est en ouest
    for (let z = sz - 3; z < sz + 6; z++) w.setRoad(sx + 4, z, true);
    const g = w.place('gate', sx + 4, sz, 0, false, 1, false);
    expect(gateAlongX(rampartMask(w, g))).toBe(true);
    const h = w.place('gate', sx + 6, sz + 3, 0, false, 1, false);
    w.setRoad(sx + 5, sz + 3, true); w.setRoad(sx + 7, sz + 3, true);
    expect(gateAlongX(rampartMask(w, h))).toBe(false);
  });
});

describe('remparts : un modèle détaillé et distinct à chaque âge', () => {
  const verts = (kind: KindId, age: number, mask: number) => {
    const m = getModel(kind, age, { v: 0, L: false, R: false, F: false, mask });
    m.body.computeBoundingBox();
    return { n: m.body.attributes.position.count + (m.glow?.attributes.position.count ?? 0), glow: m.glow?.attributes.position.count ?? 0, box: m.body.boundingBox! };
  };

  for (const kind of ['wall', 'gate'] as KindId[]) {
    it(`${kind} : des milliers de sommets, des lumières, cinq modèles différents (l’Antiquité pour les âges 0 et 1)`, () => {
      const seen = new Set<number>();
      for (const age of [1, 2, 3, 4, 5]) {
        const r = verts(kind, age, WALL_E | WALL_W);
        expect(r.n, `${kind} ${age}`).toBeGreaterThan(1500);
        expect(r.n).toBeLessThan(40000);
        expect(r.glow, `${kind} ${age}`).toBeGreaterThan(0);
        seen.add(r.n);
      }
      expect(seen.size).toBe(5);
      expect(verts(kind, 0, WALL_E | WALL_W).n).toBe(verts(kind, 1, WALL_E | WALL_W).n);
    });
  }

  it('un pan reste dans sa case, ses bras vont jusqu’au bord pour toucher le voisin ; le bout et l’angle ont leur tourelle', () => {
    for (const age of [1, 2, 3, 4, 5]) {
      const straight = verts('wall', age, WALL_E | WALL_W), end = verts('wall', age, WALL_E), corner = verts('wall', age, WALL_N | WALL_E);
      expect(straight.box.max.x).toBeGreaterThan(0.48); expect(straight.box.min.x).toBeLessThan(-0.48);
      expect(straight.box.max.x).toBeLessThan(0.56); expect(straight.box.max.z).toBeLessThan(0.56);
      expect(straight.box.max.y).toBeGreaterThan(0.4);
      // le bout : une tourelle plus haute que le mur, un seul bras
      expect(end.box.max.y).toBeGreaterThan(straight.box.max.y);
      expect(end.box.min.x).toBeGreaterThan(-0.4);
      expect(corner.box.min.z).toBeLessThan(-0.48);
      expect(corner.n).not.toBe(straight.n);
    }
  });

  it('la porte touche les deux bords de la case et laisse le passage au milieu ; tournée pour un mur nord-sud', () => {
    for (const age of [1, 2, 3, 4, 5]) {
      const g = verts('gate', age, WALL_E | WALL_W), t = verts('gate', age, WALL_N | WALL_S);
      expect(g.box.max.x).toBeGreaterThan(0.48); expect(g.box.min.x).toBeLessThan(-0.48);
      expect(g.box.max.y).toBeGreaterThan(0.9);
      expect(t.box.max.z).toBeGreaterThan(0.48); expect(t.box.min.z).toBeLessThan(-0.48);
      expect(t.n).toBe(g.n);
    }
  });
});
