import { describe, it, expect } from 'vitest';
import { shortWhy } from '../src/sim/recruitPlan';

describe('cavalier : la bonne raison en peu de mots', () => {
  it('un haras sans cheval libre dit « Pas de cheval libre », pas « Il faut une écurie »', () => {
    expect(shortWhy('Pas de cheval disponible à l’écurie (en élever, ou attendre le retour d’une expédition montée)')).toBe('Pas de cheval libre');
    expect(shortWhy('No horse available at the stable (breed more, or wait for a mounted expedition to come back)')).toBe('Pas de cheval libre');
    expect(shortWhy('Il faut une écurie au village (la cavalerie monte les chevaux de l’écurie)')).toBe('Il faut une écurie');
  });
});
