import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, playSize, CONTINENT, MAPS } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { validate } from '../src/save/save';

/** Une sauvegarde minimale, à la taille `n` */
const saveOf = (n: number) => ({ v: 1, map: CONTINENT, seed: 1, world: { n, heights: [] }, age: 0, pop: 0, seasonT: 0, hour: 8, settings: {}, savedAt: 0 });

describe('taille de la carte propre à chaque partie', () => {
  afterAll(() => setMapSize(192));

  it('une sauvegarde à une taille connue est acceptée, une ancienne plus petite refusée', () => {
    for (const n of MAPS[0].sizes) expect(() => validate(saveOf(n))).not.toThrow();
    expect(() => validate(saveOf(96))).toThrow();
  });

  it('une partie reprise garde la taille de sa sauvegarde, une nouvelle prend celle de la carte', () => {
    expect(playSize(CONTINENT)).toBe(MAPS[0].size);
    expect(playSize(CONTINENT, 320)).toBe(320);
    expect(playSize(CONTINENT, 192)).toBe(192);
    expect(playSize(CONTINENT, 96)).toBe(MAPS[0].size);
  });

  it('une carte de 320 se génère, se sauvegarde et se recharge à sa taille', () => {
    setMapSize(320);
    const w = new World();
    newWorld(w, CONTINENT, 11, GEN);
    expect(w.heights.length).toBe(321 * 321);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    expect(d.n).toBe(320);
    const back = new World();
    back.fromJSON(d);
    expect(Array.from(back.heights).every((h, i) => Math.abs(h - w.heights[i]) < 0.006)).toBe(true);
    // une carte de 192 ne lit pas une sauvegarde de 320
    setMapSize(192);
    expect(() => new World().fromJSON(d)).toThrow();
  }, 30000);
});
