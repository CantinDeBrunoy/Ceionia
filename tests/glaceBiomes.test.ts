import { describe, it, expect } from 'vitest';
import { snowMapData, setSnowMap, ICE_ERODE } from '../src/render/snow';
import { SNOWY } from '../src/render/terrainView';
import { BIOME_TEMPERATE, BIOME_DESERT, BIOME_TROPICAL } from '../src/world/world';

const n = 48;
/** Froid (canal g, 0 … 1) et neige (canal r) d'une case */
const cold = (d: Uint8Array, x: number, z: number) => d[(z * n + x) * 2 + 1] / 255;
const snow = (d: Uint8Array, x: number, z: number) => d[(z * n + x) * 2] / 255;
/** Carte faite de biomes : `biome(x, z)` */
const map = (biome: (x: number, z: number) => number) => snowMapData(n, (k) => SNOWY[biome(k % n, Math.floor(k / n))]);

describe('glace de l\'eau selon le biome', () => {
  it('ne gèle rien au désert ni sous les tropiques', () => {
    for (const b of [BIOME_DESERT, BIOME_TROPICAL]) {
      const d = map(() => b);
      for (let k = 0; k < n * n; k++) expect(d[k * 2 + 1] / 255).toBeLessThan(0.3);
    }
  });

  it('gèle au cœur d\'une région tempérée', () => {
    const d = map(() => BIOME_TEMPERATE);
    expect(cold(d, 24, 24)).toBeGreaterThan(0.95);
  });

  it('ne gèle pas au fond vert et étroit d\'un canyon du désert', () => {
    // bande de prairie de 6 cases au milieu du désert (le fond du canyon est peint en prairie)
    const d = map((x) => (Math.abs(x - 24) < 3 ? BIOME_TEMPERATE : BIOME_DESERT));
    for (let z = 0; z < n; z++) for (let x = 21; x <= 27; x++) expect(cold(d, x, z)).toBeLessThan(0.3);
    // la neige des toits, elle, suit encore la prairie
    expect(snow(d, 24, 24)).toBeGreaterThan(0.5);
  });

  it('passe en douceur du froid au chaud, sans marche d\'une case à l\'autre', () => {
    const d = map((x) => (x < 24 ? BIOME_TEMPERATE : BIOME_DESERT));
    for (let x = 1; x < n; x++) expect(Math.abs(cold(d, x, 10) - cold(d, x - 1, 10))).toBeLessThan(0.25);
    // et la glace s'arrête avant le désert
    expect(cold(d, 23, 10)).toBeLessThan(0.3);
    expect(cold(d, 24 - ICE_ERODE - 3, 10)).toBeGreaterThan(0.9);
  });
});

describe('carte de neige', () => {
  it('ne se refait que si une case a changé', () => {
    const b = new Uint8Array(n * n);
    const snowy = (k: number) => SNOWY[b[k]];
    expect(setSnowMap(n, snowy)).toBe(true);
    expect(setSnowMap(n, snowy)).toBe(false);
    b[5] = 2;
    expect(setSnowMap(n, snowy)).toBe(true);
    expect(setSnowMap(n, snowy)).toBe(false);
  });
});
