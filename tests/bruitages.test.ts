import { describe, it, expect } from 'vitest';
import type { Building, KindId } from '../src/build/catalog';
import { soundsOf, buildingSpots, pickVoices, SPOT_DEFS, type Spot } from '../src/audio/spots';
import { VOICES } from '../src/audio/voices';

const day = { daylight: 1, rain: 0, winter: false };
const night = { daylight: 0, rain: 0, winter: false };
const b = (kind: KindId, x: number, z: number, age: number, id = 1): Building => ({ id, kind, x, z, rot: 0, auto: false, age });

describe('bruitages de proximité', () => {
  it('chaque bâtiment sonne selon son âge', () => {
    expect(soundsOf('workshop', 2)).toEqual(['forge']);
    expect(soundsOf('workshop', 0)).toEqual(['flint']);
    expect(soundsOf('workshop', 4)).toEqual([]);
    expect(soundsOf('mill', 2)).toEqual(['mill']);
    expect(soundsOf('mill', 5)).toEqual(['wind']);
    expect(soundsOf('pen', 0)).toEqual(['sheep']);
    expect(soundsOf('pen', 2)).toEqual(['sheep', 'hens']);
    expect(soundsOf('pen', 3)).toEqual(['cows', 'hens']);
    expect(soundsOf('fusion', 5)).toEqual(['machine']);
    expect(soundsOf('house', 2)).toEqual([]);
  });

  it('toutes les sortes ont une voix', () => expect(Object.keys(VOICES).sort()).toEqual(Object.keys(SPOT_DEFS).sort()));

  it('une forge proche s’entend, loin non', () => {
    const near = pickVoices(buildingSpots([b('workshop', 10, 10, 2)], 11, 11), 11, 11, 20, day, 6);
    expect(near[0]?.kind).toBe('forge');
    expect(near[0].k).toBeGreaterThan(0.7);
    const far = pickVoices(buildingSpots([b('workshop', 40, 40, 2)], 11, 11), 11, 11, 20, day, 6);
    expect(far).toEqual([]);
  });

  it('la caméra trop haute éteint les bâtiments, pas le volcan', () => {
    const spots: Spot[] = [{ kind: 'forge', x: 10, z: 10 }, { kind: 'volcano', x: 14, z: 10 }];
    const kinds = pickVoices(spots, 10, 10, 120, day, 6).map((v) => v.kind);
    expect(kinds).toEqual(['volcano']);
  });

  it('la nuit, les ateliers se taisent et la taverne s’anime', () => {
    const spots: Spot[] = [{ kind: 'forge', x: 10, z: 10 }, { kind: 'tavern', x: 11, z: 10 }];
    expect(pickVoices(spots, 10, 10, 20, night, 6).map((v) => v.kind)).toEqual(['tavern']);
    const kd = pickVoices(spots, 10, 10, 20, day, 6).find((v) => v.kind === 'tavern')!.k;
    const kn = pickVoices(spots, 10, 10, 20, night, 6)[0].k;
    expect(kn).toBeGreaterThan(kd);
  });

  it('une sorte = une voix ; plusieurs sources se cumulent sans dépasser 1, la plus proche donne la position', () => {
    const one = pickVoices([{ kind: 'sheep', x: 18, z: 10 }], 10, 10, 20, day, 6)[0].k;
    const three = pickVoices([{ kind: 'sheep', x: 18, z: 10 }, { kind: 'sheep', x: 10, z: 18 }, { kind: 'sheep', x: 3, z: 10 }], 10, 10, 20, day, 6);
    expect(three).toHaveLength(1);
    expect(three[0].k).toBeGreaterThan(one);
    expect(three[0].k).toBeLessThanOrEqual(1);
    expect([three[0].x, three[0].z]).toEqual([3, 10]);
  });

  it('le nombre de voix est limité aux plus fortes', () => {
    const spots: Spot[] = (Object.keys(SPOT_DEFS) as Spot['kind'][]).map((kind, i) => ({ kind, x: 10 + (i % 3), z: 10 }));
    const v = pickVoices(spots, 10, 10, 20, day, 3);
    expect(v).toHaveLength(3);
    expect(v[0].k).toBeGreaterThanOrEqual(v[2].k);
  });

  it('pas d’abeilles en hiver, foule moins forte sous la pluie', () => {
    const s: Spot[] = [{ kind: 'bees', x: 10, z: 10 }, { kind: 'crowd', x: 10, z: 10 }];
    expect(pickVoices(s, 10, 10, 20, { ...day, winter: true }, 6).map((v) => v.kind)).toEqual(['crowd']);
    const dry = pickVoices(s, 10, 10, 20, day, 6).find((v) => v.kind === 'crowd')!.k;
    const wet = pickVoices(s, 10, 10, 20, { ...day, rain: 1 }, 6).find((v) => v.kind === 'crowd')!.k;
    expect(wet).toBeLessThan(dry * 0.5);
  });
});
