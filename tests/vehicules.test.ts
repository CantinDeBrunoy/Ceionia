import { describe, it, expect } from 'vitest';
import { unitGeo } from '../src/render/emergency';

describe('véhicules des secours', () => {
  it('sans usine automobile, les secours sont attelés à tout âge ; avec elle, plus de cheval', () => {
    for (const age of [3, 4, 5]) for (const s of ['fire', 'health', 'police'] as const) {
      expect(unitGeo(s, age, false).horse).toBe(true);
      expect(unitGeo(s, age, true).horse).toBe(false);
    }
  });
});
