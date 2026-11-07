import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, MOUNTAIN_H } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { KINDS, KindId } from '../src/build/catalog';
import { ZONED, ZoneScan, zoneOrigins, isZoned } from '../src/build/zones';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

describe('emplacements des bâtiments à terrain précis', () => {
  const w = continent();

  it('la liste suit les règles de canPlace : ports, ponton, mine, club alpin, carrière, bûcheron, puits', () => {
    // (et les défenses de l'île du portail : tour de garde, caserne)
    expect(Object.keys(ZONED).sort()).toEqual(['alpine', 'barracks', 'harbor', 'lumber', 'mine', 'oilwell', 'pier', 'quarry', 'watchtower']);
    expect(isZoned('house')).toBe(false);
  });

  it('chaque emprise trouvée se pose, et elle respecte la contrainte du bâtiment', { timeout: 60000 }, () => {
    for (const kind of ['harbor', 'mine', 'lumber', 'pier'] as KindId[]) {
      const at = zoneOrigins(w, kind), s = KINDS[kind].size;
      expect(at.length, kind).toBeGreaterThan(0);
      for (const k of at) {
        const x = k % N, z = Math.floor(k / N);
        expect(w.canPlace(kind, x, z)).toBeNull();
        if (kind === 'mine') expect(w.flatTarget(x, z, s)).toBeGreaterThanOrEqual(MOUNTAIN_H);
        if (kind === 'harbor' || kind === 'pier') expect(w.nearWater(x, z, s)).toBe(true);
      }
    }
  });

  it('la recherche par tranches trouve les mêmes emprises que d’un seul tenant', () => {
    const sc = new ZoneScan(w, 'mine');
    let frames = 0;
    while (!sc.step(2000)) frames++;
    expect(frames).toBeGreaterThan(1);
    expect(sc.origins).toBe(zoneOrigins(w, 'mine').length);
    // les cases éclairées couvrent exactement les emprises valides
    const s = KINDS.mine.size, cells = new Uint8Array(N * N);
    for (const k of zoneOrigins(w, 'mine')) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) cells[k + j * N + i] = 1;
    expect(Array.from(sc.cells)).toEqual(Array.from(cells));
  });

  it('sans emplacement, le message dit ce qui manque', () => {
    const flat = new World();
    const sc = new ZoneScan(flat, 'mine');
    while (!sc.step(5000));
    expect(sc.origins).toBe(0);
    expect(sc.emptyMessage('Mine')).toMatch(/^Aucun emplacement pour « Mine » : il faut une montagne\./);
  });
});
