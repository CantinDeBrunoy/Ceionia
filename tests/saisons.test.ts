import { describe, it, expect, vi } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GameTime } from '../src/core/time';
import { computeSeason, makeSeasonState } from '../src/render/season';
import { TerrainView } from '../src/render/terrainView';

// les textures du sol se dessinent sur un canevas, absent hors du navigateur : une texture vide suffit ici
vi.mock('../src/render/textures', async () => {
  const THREE = await import('three');
  const blank = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);
  return { groundDetailTexture: blank, waterNormalTexture: blank };
});

/** Le continent, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** La saison qui domine le décor */
const shown = (time: GameTime) => { const m = time.mix(); return m.t < 0.5 ? m.a : m.b; };

describe('saisons', () => {
  it('la saison affichée est toujours celle qui domine le décor', () => {
    const time = new GameTime();
    for (let i = 0; i < 4000; i++) {
      time.seasonT = i / 1000;
      // pile au changement de saison, le décor est à mi-chemin
      if (i % 1000 === 0) { expect(time.mix().t).toBeCloseTo(0.5, 6); continue; }
      expect(shown(time), `saison ${time.seasonT}`).toBe(time.season);
    }
  });

  it('une saison choisie dans les réglages se montre telle quelle, sans transition entamée', () => {
    const time = new GameTime();
    for (let i = 0; i < 4; i++) {
      time.setSeason(i);
      expect(time.season).toBe(i);
      expect(time.mix()).toEqual({ a: i, b: (i + 1) % 4, t: 0 });
    }
  });

  it('pas de neige en été ; l’hiver, la neige domine ; le décor change sans à-coup, même au tour de l’an', () => {
    const time = new GameTime(), s = makeSeasonState();
    let last = -1;
    for (let i = 0; i <= 4000; i++) {
      time.seasonT = (i % 4000) / 1000;
      computeSeason(time, s);
      if (time.season === 1) expect(s.snow).toBeLessThan(0.03);
      if (time.season === 3) expect(s.snow).toBeGreaterThanOrEqual(0.5);
      if (last >= 0) expect(Math.abs(s.snow - last)).toBeLessThan(0.02);
      last = s.snow;
    }
  });

  it('le sol suit la saison sur toute la carte, même quand les saisons filent (×4, saisons courtes)', () => {
    const w = continent(), terrain = new TerrainView(w), time = new GameTime(), pal = makeSeasonState();
    const colors = () => Float32Array.from(terrain.top.geometry.attributes.color.array as Float32Array);
    // tout l'hiver sur la carte, puis l'été qui arrive
    time.setSeason(3);
    terrain.update(computeSeason(time, pal));
    time.setSeason(1);
    computeSeason(time, pal);
    // le jeu redemande les teintes toutes les trois images : le balayage ne doit pas repartir du haut à chaque fois
    for (let f = 0; f < 60; f++) {
      if (f % 3 === 0) terrain.recolor(pal);
      terrain.stepRecolor();
    }
    const got = colors();
    terrain.update(pal);
    const want = colors();
    let worst = 0;
    for (let i = 0; i < want.length; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
    expect(worst).toBeLessThan(1e-5);
  }, 20000);
});
