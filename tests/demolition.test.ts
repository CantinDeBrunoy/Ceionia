import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { KindId } from '../src/build/catalog';
import { costOf, refund, refundOf } from '../src/sim/economy';
import { Difficulty } from '../src/sim/difficulty';

/** Un monde plat et vide, avec des bâtiments posés à la main */
function world(d: Difficulty, list: [KindId, number][]) {
  const w = new World();
  w.difficulty = d;
  w.heights.fill(1);
  let x = 10;
  for (const [kind, age] of list) {
    w.buildings.set(w.nextId, { id: w.nextId++, kind, x, z: 10, rot: 0, auto: true, age });
    x += 5;
  }
  return w;
}
const first = (w: World) => [...w.buildings.values()][0];

describe('démolir rend une part du prix', () => {
  it('Facile : tout le prix d’un grand bâtiment', () => {
    const w = world('easy', [['workshop', 1]]);
    const c = costOf('workshop', 1, 'easy')!;
    expect(c).toBeTruthy();
    const wood = w.wood, stone = w.stone;
    expect(refund(w, first(w))).toEqual({ wood: c.wood, stone: c.stone });
    expect(w.wood - wood).toBe(c.wood);
    expect(w.stone - stone).toBe(c.stone);
  });

  it('Normal : la moitié, arrondie vers le bas', () => {
    const w = world('normal', [['house', 2]]);
    const c = costOf('house', 2, 'normal')!;
    expect(refundOf(w, first(w))).toEqual({ wood: Math.floor(c.wood / 2), stone: Math.floor(c.stone / 2) });
  });

  it('Normal : les briques aussi, à moitié', () => {
    const w = world('normal', [['station', 3]]);
    const c = costOf('station', 3, 'normal')!;
    expect(refundOf(w, first(w))?.brick).toBe(Math.floor(c.brick! / 2));
  });

  it('rien en bac à sable, ni pour un petit bâtiment gratuit en Facile', () => {
    expect(refundOf(world('sandbox', [['lumber', 1]]), first(world('sandbox', [['lumber', 1]])))).toBeNull();
    const w = world('easy', [['house', 1]]);
    expect(refundOf(w, first(w))).toBeNull();
  });

  it('Normal : le premier bûcheron, offert, ne rend rien ; le second rend la moitié', () => {
    const one = world('normal', [['lumber', 0]]);
    expect(refundOf(one, first(one))).toBeNull();
    const two = world('normal', [['lumber', 0], ['lumber', 0]]);
    expect(refundOf(two, first(two))?.stone).toBeGreaterThan(0);
  });
});
