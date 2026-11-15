import { describe, it, expect, afterAll } from 'vitest';
import { World, N, setMapSize, BIOME_DESERT, BIOME_TROPICAL } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH, GEN, mainFrame } from '../src/world/continent';
import { ARCH_N, MAIN_N, archLayout } from '../src/world/archipelago';
import { sculpt } from '../src/world/terraform';

const SEEDS = [11, 4242];
const cache = new Map<number, World>();
/** L'archipel d'une graine (carte de 384, version 4) */
function archipel(seed: number) {
  if (!cache.has(seed)) {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = seed;
    newWorld(w, CONTINENT, seed, GEN_ARCH);
    w.updateVis();
    cache.set(seed, w);
  }
  return cache.get(seed)!;
}

/** Cases de terre reliées à la case (x, z), par un côté */
function landFrom(w: World, x0: number, z0: number) {
  const seen = new Uint8Array(N * N), cells: number[] = [];
  const land = (x: number, z: number) => w.inCells(x, z) && !w.isWaterCell(x, z);
  if (!land(x0, z0)) return seen;
  seen[z0 * N + x0] = 1; cells.push(z0 * N + x0);
  for (let i = 0; i < cells.length; i++) {
    const x = cells[i] % N, z = Math.floor(cells[i] / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (z + dz) * N + x + dx;
      if (land(x + dx, z + dz) && !seen[k]) { seen[k] = 1; cells.push(k); }
    }
  }
  return seen;
}
const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);

describe('archipel (version 4, carte de 384)', () => {
  afterAll(() => setMapSize(192));

  it('la place des îles se tire de la graine : cadre de l’île principale dans la carte, îles rivales hors du cadre', () => {
    for (const seed of SEEDS) {
      const a = archLayout(seed), b = archLayout(seed);
      expect(a).toEqual(b);
      expect(a.main.n).toBe(MAIN_N);
      expect(a.main.x).toBeGreaterThanOrEqual(0);
      expect(a.main.x + a.main.n).toBeLessThanOrEqual(ARCH_N);
      expect(a.main.z + a.main.n).toBeLessThanOrEqual(ARCH_N);
      expect(new Set(a.rivals.map((q) => q.people))).toEqual(new Set(['orient', 'asie']));
      for (const q of [...a.rivals, ...a.small]) {
        const inMain = q.x > a.main.x && q.x < a.main.x + a.main.n && q.z > a.main.z && q.z < a.main.z + a.main.n;
        expect(inMain).toBe(false);
      }
    }
    expect(archLayout(11)).not.toEqual(archLayout(12));
  });

  it('deux îles rivales d’environ la moitié de l’île principale, séparées par la mer', () => {
    for (const seed of SEEDS) {
      const w = archipel(seed), lay = w.isles!;
      const [sx, sz] = w.startSpot(), main = count(landFrom(w, sx, sz));
      const isles = lay.rivals.map((q) => landFrom(w, Math.round(q.village.x), Math.round(q.village.z)));
      for (const isle of isles) {
        const n = count(isle);
        expect(n).toBeGreaterThan(9000);
        expect(n).toBeLessThan(15000);
        expect(n / main).toBeGreaterThan(0.35);
        expect(n / main).toBeLessThan(0.75);
      }
      // aucune case commune : pas de chemin à pied entre les deux îles, ni vers l'île principale
      for (let k = 0; k < N * N; k++) expect(isles[0][k] && isles[1][k]).toBeFalsy();
      const own = landFrom(w, sx, sz);
      for (const isle of isles) for (let k = 0; k < N * N; k++) if (isle[k]) expect(own[k]).toBe(0);
    }
  });

  it('chaque île rivale a la place plate d’un village, et son climat : sable au peuple oriental, verdure au peuple asiatique', () => {
    for (const seed of SEEDS) {
      const w = archipel(seed);
      for (const q of w.isles!.rivals) {
        const v = q.village;
        // (tout plat au cœur, 0,6 fois le rayon ; plus loin, il garde un peu de relief)
        const c = v.r * 0.6;
        expect(v.r).toBeGreaterThanOrEqual(15);
        for (let z = Math.ceil(v.z - c); z < v.z + c; z++)
          for (let x = Math.ceil(v.x - c); x < v.x + c; x++) {
            if (Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z) > c - 1) continue;
            expect(w.isWaterCell(x, z)).toBe(false);
            expect(w.cellSlope(x, z)).toBeLessThan(0.3);
          }
        const isle = landFrom(w, Math.round(v.x), Math.round(v.z));
        let hot = 0, all = 0;
        for (let k = 0; k < N * N; k++) if (isle[k]) { all++; if (w.biome[k] === BIOME_DESERT || w.biome[k] === BIOME_TROPICAL) hot++; }
        if (q.people === 'orient') expect(hot / all).toBeGreaterThan(0.6);
        else expect(hot / all).toBeLessThan(0.4);
      }
    }
  });

  it('l’île principale garde tout : départ, volcan, île du portail, grottes et pétrole dans son cadre', () => {
    for (const seed of SEEDS) {
      const w = archipel(seed), f = w.isles!.main;
      const inMain = (x: number, z: number) => x >= f.x && z >= f.z && x < f.x + f.n && z < f.z + f.n;
      const [sx, sz] = w.startSpot();
      expect(inMain(sx, sz)).toBe(true);
      expect(w.portal).not.toBeNull();
      expect(inMain(w.portal!.x, w.portal!.z)).toBe(true);
      let oil = 0, volcano = 0;
      for (let k = 0; k < N * N; k++) {
        if (w.oil[k]) { oil++; expect(inMain(k % N, Math.floor(k / N))).toBe(true); }
        if (w.veg[k] === 7) { volcano++; expect(inMain(k % N, Math.floor(k / N))).toBe(true); }
      }
      expect(oil).toBeGreaterThan(0);
      expect(volcano).toBeGreaterThan(0);
      expect(mainFrame(GEN_ARCH, seed, ARCH_N)).toEqual(f);
    }
  });

  it('la sauvegarde garde la version et la place des îles, et se recharge à l’identique', () => {
    const w = archipel(11), d = JSON.parse(JSON.stringify(w.toJSON()));
    expect(d.gen).toBe(GEN_ARCH);
    expect(d.isles.rivals.length).toBe(2);
    setMapSize(ARCH_N);
    const back = new World();
    back.seed = 11;
    back.fromJSON(d);
    expect(back.isles).toEqual(w.isles);
    back.computeBiomes();
    // (le relief est sauvegardé au centième : quelques cases au bord d'un seuil peuvent changer de biome)
    let same = 0;
    for (let k = 0; k < N * N; k++) if (back.biome[k] === w.biome[k]) same++;
    expect(same / (N * N)).toBeGreaterThan(0.995);
  });

  it('sans allié, on ne bâtit, ne trace et ne sculpte que sur l’île principale', () => {
    const w = archipel(4242), v = w.isles!.rivals[0].village, x = Math.round(v.x), z = Math.round(v.z);
    expect(w.canPlace('house', x, z)).toMatch(/Choisissez d’abord votre allié/);
    expect(w.canRoad(x, z)).toBe(false);
    expect(w.paintBiome(x, z, 0)).toBe(false);
    const before = Float32Array.from(w.heights);
    sculpt(w, 'raise', x, z, 3, 0.05, { target: 0 });
    expect(Array.from(w.heights)).toEqual(Array.from(before));
    // sur l'île principale, rien ne change : on bâtit près du départ
    const [sx, sz] = w.startSpot();
    expect(w.canPlace('gather', sx, sz)).toBeNull();
    expect(w.canRoad(sx - 2, sz)).toBe(true);
  });

  it('de toutes petites îles : rochers, îlots, bancs de sable et atolls, hors du cadre de l’île principale', () => {
    for (const seed of SEEDS) {
      const w = archipel(seed), lay = w.isles!, f = lay.main;
      expect(lay.tiny.length).toBeGreaterThanOrEqual(30);
      expect(new Set(lay.tiny.map((q) => q.kind)).size).toBeGreaterThanOrEqual(3);
      let up = 0, solid = 0;
      for (const q of lay.tiny) {
        expect(q.x > f.x - 8 && q.z > f.z - 8 && q.x < f.x + f.n + 8 && q.z < f.z + f.n + 8).toBe(false);
        if (q.kind === 'rock' || q.kind === 'islet') { solid++; if (!w.isWaterCell(Math.floor(q.x), Math.floor(q.z))) up++; }
      }
      // (les rochers et les îlots sortent de l'eau)
      expect(up / solid).toBeGreaterThan(0.7);
    }
  });

  it('une seule mer : le large est partout à la profondeur de la mer de décor (aucun carré plus clair ou plus sombre)', () => {
    const w = archipel(11), S = ARCH_N + 1;
    let deep = 0, n = 0;
    for (let z = 0; z <= ARCH_N; z += 4) for (let x = 0; x <= ARCH_N; x += 4) { const h = w.heights[z * S + x]; if (h < -0.95) { n++; if (Math.abs(h + 1) < 0.05) deep++; } }
    expect(deep / n).toBeGreaterThan(0.97);
  });

  it('avant la version 4, le cadre est toute la carte (rien ne change aux anciennes parties)', () => {
    expect(mainFrame(GEN, 11, 192)).toEqual({ x: 0, z: 0, n: 192 });
  });
});
