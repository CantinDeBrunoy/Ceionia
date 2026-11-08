import { describe, it, expect } from 'vitest';
import { Building, KindId } from '../src/build/catalog';
import { computeCoverage, policeRange, FIRE_RANGE, COVER_JOY_MAX, coverageTips } from '../src/sim/coverage';

let id = 1;
const b = (kind: KindId, x: number, z: number, age = 1): Building => ({ id: id++, kind, x, z, rot: 0, auto: true, age });

describe('couverture de sécurité', () => {
  it('rayons : 14 cases pour les pompiers, 12 + âge pour la police', () => {
    expect(FIRE_RANGE).toBe(14);
    expect(policeRange(1)).toBe(13);
    expect(policeRange(5)).toBe(17);
  });

  it('sans habitation, tout est couvert ; sans poste, rien ne l’est', () => {
    expect(computeCoverage([]).share).toBe(1);
    const c = computeCoverage([b('house', 10, 10), b('house', 12, 10)]);
    expect(c.homes).toBe(2);
    expect(c.share).toBe(0);
    expect(coverageTips(c, [b('house', 10, 10)]).join(' ')).toContain('caserne');
  });

  it('une caserne couvre les maisons à portée seulement, la jauge est la moyenne des deux', () => {
    const near = b('house', 20, 10), far = b('house', 60, 10);
    const c = computeCoverage([near, far, b('fire', 10, 10), b('police', 10, 14)]);
    expect(c.fire).toBe(1);
    expect(c.police).toBe(1);
    expect(c.both).toBe(1);
    expect(c.share).toBeCloseTo(0.5);
    expect(c.uncoveredFire).toEqual([far]);
  });

  it('seulement les pompiers : la moitié de la jauge ; la police couvre plus loin avec l’âge', () => {
    const h = b('house', 30, 10);
    expect(computeCoverage([h, b('fire', 10, 10)]).share).toBe(0);
    expect(computeCoverage([h, b('fire', 25, 10)]).share).toBeCloseTo(0.5);
    expect(computeCoverage([h, b('police', 10, 10, 5)]).police).toBe(0);
    expect(computeCoverage([h, b('police', 14, 10, 5)]).police).toBe(1);
    expect(computeCoverage([h, b('police', 14, 10, 1)]).police).toBe(0);
  });

  it('le bonus de bien-être est léger et plafonné', () => {
    const list: Building[] = [b('fire', 40, 40), b('police', 40, 40, 5)];
    for (let i = 0; i < 80; i++) list.push(b('house', 32 + (i % 10) * 2, 32 + Math.floor(i / 10) * 2));
    const c = computeCoverage(list);
    expect(c.share).toBe(1);
    expect(c.joy).toBe(COVER_JOY_MAX);
  });
});

