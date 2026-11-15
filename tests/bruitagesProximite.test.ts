import { describe, it, expect } from 'vitest';
import { spotPan } from '../src/audio/audio';

describe('bruitages de proximité : panoramique', () => {
  it('une projection non finie (caméra pas prête) donne le centre, jamais NaN', () => {
    expect(spotPan(NaN)).toBe(0);
    expect(spotPan(Infinity)).toBe(0);
    expect(spotPan(undefined)).toBe(0);
  });
  it('une valeur normale passe, bornée entre −1 et 1', () => {
    expect(spotPan(0.4)).toBe(0.4);
    expect(spotPan(-3)).toBe(-1);
    expect(spotPan(2)).toBe(1);
  });
});
