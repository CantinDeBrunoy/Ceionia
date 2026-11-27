import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world';
import { KindId } from '../src/build/catalog';
import { canPay, costOf, lastPlace, priceIn, refundOf } from '../src/sim/economy';
import { Difficulty } from '../src/sim/difficulty';
import { isStart, startRefusal } from '../src/build/startLock';

/**
 * Plus de feu de camp (chasseur de bugs, 27 nov. 2026) : en Normal, le feu de camp démoli sans 5 bois et 3 pierres pour le
 * refaire, tout restait verrouillé et plus rien ne rapportait de bois. La place du village est désormais offerte quand le
 * village n'en a plus, et l'on prévient avant de démolir la dernière
 */
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
const all = (w: World) => [...w.buildings.values()];

describe('la place du village jamais hors de prix', () => {
  it('Normal : sans place ni ressources, le feu de camp se refait gratuitement (village vide)', () => {
    const w = world('normal', []);
    w.wood = 0; w.stone = 0;
    expect(isStart(w)).toBe(true);
    expect(startRefusal(w, 'build', 'gather', 'Feu de camp')).toBeNull();
    expect(priceIn(w, 'gather', 0)).toBeNull();
    expect(canPay(w, priceIn(w, 'gather', 0))).toBe(true);
  });

  it('Normal : sans place mais avec d’autres bâtiments, elle est offerte aussi, à tous les âges', () => {
    const w = world('normal', [['house', 0], ['lumber', 0]]);
    w.wood = 0; w.stone = 0;
    for (let a = 0; a <= 5; a++) expect(priceIn(w, 'gather', a)).toBeNull();
  });

  it('Normal : une seconde place se paie comme avant', () => {
    const w = world('normal', [['gather', 1]]);
    expect(priceIn(w, 'gather', 1)).toEqual(costOf('gather', 1, 'normal'));
    expect(priceIn(w, 'gather', 1)).not.toBeNull();
  });

  it('démolir la dernière place prévient et ne rend rien ; une place parmi deux rend la moitié de son prix', () => {
    const one = world('normal', [['gather', 0], ['house', 0]]), p = all(one)[0];
    expect(lastPlace(one, [p])).toBe(true);
    expect(lastPlace(one, [all(one)[1]])).toBe(false);
    expect(refundOf(one, p)).toBeNull();
    const two = world('normal', [['gather', 2], ['gather', 2]]);
    expect(lastPlace(two, [all(two)[0]])).toBe(false);
    expect(lastPlace(two, all(two))).toBe(true);
    expect(refundOf(two, all(two)[0])).not.toBeNull();
  });

  it('ni en Facile (déjà gratuite) ni au bac à sable : aucun avertissement', () => {
    for (const d of ['easy', 'sandbox'] as Difficulty[]) {
      const w = world(d, [['gather', 0]]);
      expect(lastPlace(w, all(w))).toBe(false);
      expect(priceIn(w, 'gather', 0)).toBeNull();
    }
  });
});
