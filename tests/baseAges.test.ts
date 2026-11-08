import { describe, it, expect } from 'vitest';
import { baseAgeGeo, baseAgeOf, BASE_AGE_MAX } from '../src/render/hellBaseAges';
import { BASE_KINDS } from '../src/sim/hellBase';

describe('bâtiments de la base des Enfers selon l’âge', () => {
  it('ramène l’âge du village aux cinq variantes', () => {
    expect(baseAgeOf(0)).toBe(1);
    expect(baseAgeOf(1)).toBe(1);
    expect(baseAgeOf(3)).toBe(3);
    expect(baseAgeOf(99)).toBe(BASE_AGE_MAX);
  });

  it('chaque bâtiment (hors palissade et porte) a une variante par âge, toutes différentes', () => {
    for (const kind of BASE_KINDS.filter((k) => k !== 'palisade' && k !== 'gate')) {
      const counts = new Set<number>();
      for (let age = 1; age <= BASE_AGE_MAX; age++) {
        const g = baseAgeGeo(kind, age);
        expect(g, `${kind} âge ${age}`).not.toBeNull();
        expect(g!.solid.attributes.position.count).toBeGreaterThan(30);
        counts.add(g!.solid.attributes.position.count);
      }
      expect(counts.size, kind).toBe(BASE_AGE_MAX);
    }
  });

  it('la palissade garde sa forme d’origine (pas de variante d’âge ici)', () => {
    expect(baseAgeGeo('palisade', 3)).toBeNull();
  });

  it('les âges avancés ajoutent leurs détails animés', () => {
    const camp1 = baseAgeGeo('camp', 1)!, camp5 = baseAgeGeo('camp', 5)!;
    expect(camp1.smoke.length + camp1.sparks.length).toBeGreaterThan(0);
    expect(camp5.field).not.toBeNull();
    expect(camp5.spin.length).toBeGreaterThan(0);
    expect(baseAgeGeo('smithy', 3)!.smoke.length).toBeGreaterThan(1);
  });
});
