import { describe, it, expect } from 'vitest';
import { validate, readSaveFile, MAX_SAVE_FILE } from '../src/save/save';
import { AGES } from '../src/build/catalog';
import { CONTINENT } from '../src/world/mapgen';

/**
 * Une sauvegarde abîmée ou retouchée à la main (partagée sur un forum, par exemple) : l'âge et la population, repris tels
 * quels au chargement, sont ramenés dans leurs bornes au lieu de faire planter la partie ; un fichier énorme est refusé
 */

const save = (extra: Record<string, unknown>) => ({ v: 1, map: CONTINENT, world: { heights: [], n: 192 }, ...extra });

describe('sauvegarde aux champs de mauvais type', () => {
  it('un âge hors de la liste revient au dernier âge', () => {
    expect(validate(save({ age: 9, pop: 10 })).age).toBe(AGES.length - 1);
    expect(validate(save({ age: -3, pop: 10 })).age).toBe(0);
  });

  it('un âge écrit en texte est relu, un âge illisible vaut la Préhistoire', () => {
    expect(validate(save({ age: '3', pop: 10 })).age).toBe(3);
    expect(validate(save({ age: 'abc', pop: 10 })).age).toBe(0);
    expect(validate(save({ age: { x: 1 }, pop: 10 })).age).toBe(0);
    expect(validate(save({ age: 2.6, pop: 10 })).age).toBe(3);
  });

  it('une population négative ou illisible vaut zéro, une population juste est gardée', () => {
    expect(validate(save({ age: 1, pop: -5 })).pop).toBe(0);
    expect(validate(save({ age: 1, pop: 'beaucoup' })).pop).toBe(0);
    expect(validate(save({ age: 1, pop: 42.5 })).pop).toBe(42.5);
  });

  it('une partie normale reste telle quelle', () => {
    const d = validate(save({ age: 4, pop: 230 }));
    expect([d.age, d.pop]).toEqual([4, 230]);
  });

  it('un fichier importé bien trop gros est refusé sans être lu', async () => {
    let read = false;
    const big = { size: MAX_SAVE_FILE + 1, text: async () => { read = true; return '{}'; } } as unknown as File;
    await expect(readSaveFile(big)).rejects.toThrow();
    expect(read).toBe(false);
  });
});
