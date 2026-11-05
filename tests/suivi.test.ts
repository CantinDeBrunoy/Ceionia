import { describe, it, expect } from 'vitest';
import { followPoint } from '../src/render/expeditionView';

describe('suivi de l’équipe par la caméra', () => {
  it('vise le fanion, pas la moyenne', () => {
    const p = followPoint([10, 4], [3, 3], null, false)!;
    expect([p.x, p.z]).toEqual([10, 4]);
  });
  it('sans fanion, le premier de la file', () => {
    const p = followPoint(null, [3, 3], null, false)!;
    expect([p.x, p.z]).toEqual([3, 3]);
  });
  it('sur place, se pose entre le fanion et le cœur de la scène', () => {
    const p = followPoint([10, 10], [10, 10], [12, 10], true, 1)!;
    expect(p.x).toBeCloseTo(11); expect(p.z).toBeCloseTo(10); expect(p.lift).toBeCloseTo(0.6);
  });
  it('sur place mais loin de la scène : reste sur le fanion', () => {
    const p = followPoint([10, 10], undefined, [30, 10], true, 1)!;
    expect([p.x, p.z, p.lift]).toEqual([10, 10, 0]);
  });
  it('plus personne de visible (sous terre) : le cœur de la scène', () => {
    const p = followPoint(null, undefined, [5, 6], true)!;
    expect([p.x, p.z]).toEqual([5, 6]);
    expect(followPoint(null, undefined, null, false)).toBeNull();
  });
});
