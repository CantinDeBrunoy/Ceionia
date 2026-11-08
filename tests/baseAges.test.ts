import { describe, it, expect } from 'vitest';
import { baseAgeGeo, baseAgeOf, BASE_AGE_MAX } from '../src/render/hellBaseAges';
import { BASE_KINDS } from '../src/sim/hellBase';
import { wallPartsAged, gatePartsAged } from '../src/render/hellWallAges';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../src/render/hellBase';

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

  it('les murs (palissade, porte) ont une forme par âge et par voisinage, gardée en cache', () => {
    const masks = [0, WALL_E | WALL_W, WALL_N | WALL_S, WALL_N | WALL_E, 15];
    const gates = new Set<number>();
    for (let age = 1; age <= BASE_AGE_MAX; age++) {
      const counts = masks.map((m) => wallPartsAged(age, m).solid.attributes.position.count);
      // sans voisin : un court pan d'est en ouest (comme avec deux côtés), un nœud seul n'existe pas
      expect(counts[0], `âge ${age}`).toBe(counts[1]);
      expect(counts[4]).toBeGreaterThan(counts[3]);
      expect(counts[3]).toBeGreaterThan(counts[1] / 2);
      expect(wallPartsAged(age, WALL_E)).toBe(wallPartsAged(age, WALL_E));
      const g = gatePartsAged(age);
      expect(g.solid.attributes.position.count).toBeGreaterThan(0);
      expect(g.leaf.attributes.position.count).toBeGreaterThan(0);
      gates.add(g.solid.attributes.position.count);
      // les pans voisins se touchent : rien ne dépasse le bord de la case
      const pg = wallPartsAged(age, WALL_E).solid; pg.computeBoundingBox();
      expect(pg.boundingBox!.max.x, `âge ${age}`).toBeLessThanOrEqual(0.52);
      // la porte reste un peu plus haute que le mur
      g.solid.computeBoundingBox();
      const top = (p: ReturnType<typeof wallPartsAged>) => { let t = 0; for (const x of [p.solid, p.shine, p.field]) if (x) { x.computeBoundingBox(); t = Math.max(t, x.boundingBox!.max.y); } return t; };
      expect(g.solid.boundingBox!.max.y).toBeGreaterThan(top(wallPartsAged(age, 15)) - 0.1);
    }
    expect(gates.size).toBe(BASE_AGE_MAX);
    // les cinq âges donnent cinq palissades différentes
    expect(new Set([1, 2, 3, 4, 5].map((a) => wallPartsAged(a, WALL_E | WALL_W).solid.attributes.position.count)).size).toBe(5);
    // le futur : champ d'énergie et néons ; la porte à champ de force s'efface, la métallique coulisse
    expect(wallPartsAged(5, WALL_E).field).not.toBeNull();
    expect(wallPartsAged(5, WALL_E).shine).not.toBeNull();
    expect(wallPartsAged(1, WALL_E).field).toBeNull();
    expect(gatePartsAged(5).fade && gatePartsAged(5).leafField).toBe(true);
    expect(gatePartsAged(4).slide).toBe(true);
    expect(gatePartsAged(2).slide || gatePartsAged(2).fade).toBe(false);
  });

  it('les âges avancés ajoutent leurs détails animés', () => {
    const camp1 = baseAgeGeo('camp', 1)!, camp5 = baseAgeGeo('camp', 5)!;
    expect(camp1.smoke.length + camp1.sparks.length).toBeGreaterThan(0);
    expect(camp5.field).not.toBeNull();
    expect(camp5.spin.length).toBeGreaterThan(0);
    expect(baseAgeGeo('smithy', 3)!.smoke.length).toBeGreaterThan(1);
  });
});
