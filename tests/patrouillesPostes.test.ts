import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { Building, KindId } from '../src/build/catalog';
import { computeCoverage, rangeOf, reaches, patrolsOf, FIRE_RANGE, PATROLS_MAX, PATROL_REACH, policeRange } from '../src/sim/coverage';
import { patrolCostOf, patrolWhy, nextPatrolCost, patrolRanges, patrolsSpent, PATROL_BRICK } from '../src/sim/stationPatrols';
import { refundOf, costOf } from '../src/sim/economy';
import { Patrols, stationWalks, patrolRides, stationRole, STATION_WALK_MAX } from '../src/sim/patrols';
import { Sim } from '../src/sim/sim';

let id = 1;
const b = (kind: KindId, x: number, z: number, age = 3, patrols?: number): Building => ({ id: id++, kind, x, z, rot: 0, auto: true, age, ...(patrols !== undefined ? { patrols } : {}) });

/** Un monde plat et vide, des stocks donnés */
function world(wood = 1000, stone = 1000, brick = 1000) {
  const w = new World();
  w.heights.fill(1);
  w.wood = wood; w.stone = stone; w.brick = brick;
  return w;
}
const put = (w: World, x: Building) => { w.buildings.set(x.id, x); w.nextId = Math.max(w.nextId, x.id + 1); return x; };

describe('patrouilles des postes de police et des casernes', () => {
  it('chaque patrouille ajoute PATROL_REACH cases de portée, trois au plus', () => {
    expect(PATROLS_MAX).toBe(3);
    expect(PATROL_REACH).toBe(3);
    expect(rangeOf(b('fire', 0, 0, 3))).toBe(FIRE_RANGE);
    expect(rangeOf(b('fire', 0, 0, 3, 1))).toBe(FIRE_RANGE + 3);
    expect(rangeOf(b('fire', 0, 0, 3, 3))).toBe(FIRE_RANGE + 9);
    expect(rangeOf(b('police', 0, 0, 2, 2))).toBe(policeRange(2) + 6);
    // (une valeur folle est bornée ; la tour de garde n'a pas de patrouille)
    expect(rangeOf(b('police', 0, 0, 2, 99))).toBe(policeRange(2) + 9);
    expect(patrolsOf({ kind: 'fire', patrols: -2 })).toBe(0);
    expect(patrolsOf({ kind: 'watchtower', patrols: 2 })).toBe(0);
    expect(rangeOf(b('watchtower', 0, 0, 2, 2))).toBe(policeRange(2));
  });

  it('la couverture et la protection suivent la nouvelle portée', () => {
    const h = b('house', 10 + FIRE_RANGE + 2, 10), st = b('fire', 10, 10);
    expect(reaches(st, h)).toBe(false);
    expect(computeCoverage([h, st]).fire).toBe(0);
    st.patrols = 1;
    expect(reaches(st, h)).toBe(true);
    expect(computeCoverage([h, st]).fire).toBe(1);
  });

  it('le coût grandit à chaque patrouille, avec des briques dès l’âge industriel', () => {
    const easy = { unlimited: false, difficulty: 'easy' as const };
    const base = costOf('fire', 1, 'easy', 1)!;
    expect(patrolCostOf('fire', 1, 1, easy)).toEqual({ wood: base.wood, stone: base.stone });
    expect(patrolCostOf('fire', 2, 1, easy)).toEqual({ wood: base.wood * 2, stone: base.stone * 2 });
    expect(patrolCostOf('fire', 3, 1, easy)).toEqual({ wood: base.wood * 3, stone: base.stone * 3 });
    const ind = costOf('police', 3, 'easy', 1)!;
    expect(patrolCostOf('police', 2, 3, easy)).toEqual({ wood: ind.wood * 2, stone: ind.stone * 2, brick: PATROL_BRICK * 2 });
    // plus cher en Normal, gratuit en ressources illimitées
    expect(patrolCostOf('police', 1, 3, { unlimited: false, difficulty: 'normal' })!.wood).toBeGreaterThan(ind.wood);
    expect(patrolCostOf('police', 1, 3, { unlimited: true, difficulty: 'easy' })).toBeNull();
  });

  it('le bouton dit pourquoi on ne peut pas : au complet, ou ce qui manque', () => {
    const w = world(0, 0, 0), st = put(w, b('police', 10, 10, 3));
    expect(patrolWhy(w, st, 3)).toContain('Il manque');
    w.wood = w.stone = w.brick = 1000;
    expect(patrolWhy(w, st, 3)).toBeNull();
    expect(patrolRanges(w, st)).toEqual([policeRange(3), policeRange(3) + 3]);
    w.setPatrols(st.id, 3);
    expect(patrolWhy(w, st, 3)).toContain('au complet');
    expect(nextPatrolCost(w, st, 3)).toBeNull();
    expect(patrolWhy(w, put(w, b('house', 20, 20)), 3)).not.toBeNull();
  });

  it('chaque patrouille emploie un habitant de plus', () => {
    const w = world(), st = put(w, b('police', 10, 10, 3));
    const sim = new Sim(w);
    sim.recalc();
    const before = sim.jobs.cap;
    w.setPatrols(st.id, 2);
    sim.recalc();
    expect(sim.jobs.cap).toBe(before + 2);
  });

  it('la démolition rend aussi la part des patrouilles', () => {
    const w = world(), st = put(w, b('fire', 10, 10, 3));
    const bare = refundOf(w, st)!;
    w.setPatrols(st.id, 2);
    const spent = patrolsSpent(w, st)!;
    const r = refundOf(w, st)!;
    expect(r.wood).toBe(bare.wood + spent.wood);
    expect(r.stone).toBe(bare.stone + spent.stone);
  });

  it('la sauvegarde garde les patrouilles, une ancienne partie se charge sans', () => {
    const w = world(), st = put(w, b('fire', 10, 10, 3)), po = put(w, b('police', 20, 10, 3)), wall = put(w, { ...b('wall', 30, 10, 2), tower: false });
    w.setPatrols(st.id, 2);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const e = new World();
    e.fromJSON(d);
    const byKind = (k: string) => [...e.buildings.values()].find((x) => x.kind === k)!;
    expect(byKind('fire').patrols).toBe(2);
    expect(byKind('police').patrols).toBeUndefined();
    expect(byKind('wall').tower).toBe(false);
    void po; void wall;
    // une partie d'avant : six cases par bâtiment, aucune patrouille
    d.buildings = d.buildings.map((r: unknown[]) => r.slice(0, 6));
    const old = new World();
    old.fromJSON(d);
    expect([...old.buildings.values()].every((x) => !x.patrols)).toBe(true);
    // une valeur abîmée est bornée
    d.buildings = d.buildings.map((r: unknown[]) => (r[0] === 'fire' ? [...r, 0, 0, 12] : r));
    const odd = new World();
    odd.fromJSON(d);
    expect([...odd.buildings.values()].find((x) => x.kind === 'fire')!.patrols).toBe(3);
  });

  it('les patrouilles vont à pied avant l’âge industriel, en véhicule ensuite', () => {
    const w = world(), st = put(w, b('police', 10, 10, 2, 2));
    expect(patrolRides(st, 2)).toBe(false);
    const walks = stationWalks('police')(w, 2);
    expect(walks.length).toBe(2);
    expect(walks[0].radius).toBe(rangeOf(st));
    expect(stationWalks('fire')(w, 2).length).toBe(0);
    st.age = 3;
    expect(patrolRides(st, 3)).toBe(true);
    expect(stationWalks('police')(w, 3).length).toBe(0);
    // (resté petit : pas de véhicule, il va à pied)
    st.small = true;
    expect(stationWalks('police')(w, 3).length).toBe(2);
    expect(stationRole('police', 1)).toBe('gendarme');
    expect(stationRole('fire', 0)).toBe('vigil');
    expect(stationRole('fire', 3)).toBe('fireman');
    for (let i = 0; i < 5; i++) put(w, b('fire', 40 + i * 5, 10, 1, 3));
    expect(stationWalks('fire')(w, 1).length).toBe(STATION_WALK_MAX);
  });
  it('les rondes à pied cèdent la place aux véhicules quand le poste prend l’âge industriel, même sans changement du monde', () => {
    const w = world(), st = put(w, b('fire', 10, 10, 2, 2));
    for (let x = 4; x < 30; x++) w.road[w.ci(x, 13)] = 1;
    const p = new Patrols(w, stationWalks('fire'), 13);
    p.update(0.1, 3);
    expect(p.groups.length).toBe(2);
    // (le bâtiment prend l'âge du village sans faire monter `world.version`)
    st.age = 3;
    for (let i = 0; i < 60; i++) p.update(0.1, 3);
    expect(p.groups.length).toBe(0);
  });
});
