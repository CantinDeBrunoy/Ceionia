import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, VEG_CAVE, VEG_FOREST, BIOME_DESERT, BIOME_MARSH, BIOME_TAIGA, BIOME_TROPICAL, BIOME_TEMPERATE } from '../src/world/world';
import { speciesIn, bearDens, ZONES, Fauna, villageCenter, NEARBY, VILLAGE_RING, SEEN_MIN, SEEN_R, VISITORS, wantsVisitors, openSea, OPEN_SEA, COAST_REACH, nearbyAllowed } from '../src/render/fauna';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { hash2 } from '../src/core/rng';

describe('faune : rattachement au décor', () => {
  beforeAll(() => setMapSize(96));

  it('chaque biome a ses espèces', () => {
    expect(speciesIn(BIOME_DESERT)).toEqual(expect.arrayContaining(['lizard', 'camel']));
    expect(speciesIn(BIOME_MARSH)).toEqual(expect.arrayContaining(['croc', 'turtle']));
    expect(speciesIn(BIOME_TROPICAL)).toEqual(expect.arrayContaining(['elephant', 'giraffe']));
    expect(speciesIn(BIOME_TAIGA)).toContain('moose');
    expect(speciesIn(BIOME_TEMPERATE)).toContain('wolf');
    // pas de chameau en taïga, pas d'éléphant au désert, des crabes partout
    expect(speciesIn(BIOME_TAIGA)).not.toContain('camel');
    expect(speciesIn(BIOME_DESERT)).not.toContain('elephant');
    for (const b of [0, 1, 2, 3, 4]) expect(speciesIn(b)).toContain('crab');
  });

  it('chaque zone est rattachée à un élément du décor', () => {
    for (const z of ZONES) { expect(z.anchors.length).toBeGreaterThan(0); expect(z.max).toBeGreaterThan(0); }
  });

  it('les ours vivent à l’entrée des grottes et au bout des failles', () => {
    const w = new World();
    w.heights.fill(1);
    const cave = w.ci(40, 40);
    w.veg[cave] = VEG_CAVE;
    // une faille : un ravin (ses cases dans rift)
    expect(w.stampFissure(70, 60)).toBe(true);
    w.computeDecor();
    // toutes les grottes ne sont pas habitées : on en pose assez pour en trouver
    for (let i = 0; i < 12; i++) { w.veg[w.ci(10 + i * 6, 20)] = VEG_CAVE; }
    w.computeDecor();
    const dens = bearDens(w);
    expect(dens.length).toBeGreaterThan(0);
    expect(dens.length).toBeLessThanOrEqual(5);
    const holes: [number, number][] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_CAVE || w.rift[k]) holes.push([k % N + 0.5, Math.floor(k / N) + 0.5]);
    for (const d of dens) {
      // sur une case libre, jamais dans le décor, et près d'une entrée
      expect(w.decor[w.ci(Math.floor(d.x), Math.floor(d.z))]).toBe(0);
      expect(Math.min(...holes.map(([x, z]) => Math.hypot(x - d.x, z - d.z)))).toBeLessThan(8);
    }
  });

  it('sans grotte, pas d’ours', () => {
    const w = new World();
    w.heights.fill(1);
    expect(bearDens(w)).toEqual([]);
  });
});

describe('faune : plus de bêtes, et toujours à voir', () => {
  beforeAll(() => setMapSize(96));
  /** Une prairie tempérée, quelques bosquets, et la place du village au milieu */
  function meadow() {
    const w = new World();
    w.heights.fill(1);
    w.computeBiomes();
    w.biome.fill(BIOME_TEMPERATE);
    for (let k = 0; k < N * N; k++) if (hash2(k % N, Math.floor(k / N), 5) < 0.12) w.veg[k] = VEG_FOREST;
    for (let z = 45; z < 52; z++) for (let x = 45; x < 52; x++) w.veg[w.ci(x, z)] = 0;
    w.place('gather', 46, 46, 0, true, 0, false);
    return w;
  }
  const cameraAt = (x: number, z: number, h: number) => {
    const c = new THREE.PerspectiveCamera(50, 1.5, 0.1, 500);
    c.position.set(x + 4, h, z + 4);
    c.lookAt(x, 1, z);
    c.updateMatrixWorld();
    return c;
  };
  const near = (f: Fauna, x: number, z: number, r: number) => (f as any).critters.filter((c: any) => !c.hidden && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r);

  it('le centre du village est sa place ; des bêtes sauvages vivent dans un anneau autour', () => {
    const w = meadow();
    expect(villageCenter(w)).toEqual([47.5, 47.5]);
    expect(villageCenter(new World())).toBeNull();
    const f = new Fauna(w, { perches: Array.from({ length: 4096 }, () => []), flowers: Array.from({ length: 4096 }, () => []) });
    f.update(0.016, 0, 12, 0, 0, 0);
    const ring = (f as any).critters.filter((c: any) => c.key.startsWith('near'));
    expect(ring.length).toBeGreaterThanOrEqual(4);
    for (const c of ring) {
      const d = Math.hypot(c.hx - 47.5, c.hz - 47.5);
      expect(d).toBeGreaterThanOrEqual(VILLAGE_RING[0]);
      expect(d).toBeLessThanOrEqual(VILLAGE_RING[1]);
      expect(NEARBY[BIOME_TEMPERATE]).toContain(c.kind);
    }
  });

  it('sous la vue, des visiteurs arrivent quand on ne voit aucune bête, sans dépasser leur plafond', () => {
    const w = meadow(), f = new Fauna(w, { perches: Array.from({ length: 4096 }, () => []), flowers: Array.from({ length: 4096 }, () => []) });
    // un coin éloigné du village, vue rapprochée
    const cam = cameraAt(14, 80, 14);
    f.update(0.016, 0, 12, 0, 0, 0, cam);
    // personne sous la vue : un groupe vient
    (f as any).critters = (f as any).critters.filter((c: any) => Math.abs(c.x - 14) > 20 || Math.abs(c.z - 80) > 20);
    for (let i = 0; i < 4 * 60; i++) f.update(1 / 60, i / 60, 12, 0, 0, 0, cam);
    expect((f as any).visitors.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 12 * 60; i++) f.update(1 / 60, i / 60, 12, 0, 0, 0, cam);
    expect(near(f, 14, 80, SEEN_R + 8).length).toBeGreaterThanOrEqual(SEEN_MIN - 1);
    expect(new Set((f as any).critters.filter((c: any) => c.key.startsWith('visit')).map((c: any) => c.key)).size).toBeLessThanOrEqual(VISITORS);
    // vue d'ensemble : on ne fait venir personne
    expect(wantsVisitors(0, 120)).toBe(false);
    expect(wantsVisitors(0, 20)).toBe(true);
    expect(wantsVisitors(SEEN_MIN, 20)).toBe(false);
  });
});

describe('faune : densité', () => {
  it('chaque biome a un gibier varié autour du village, et on veut voir plusieurs bêtes à la fois', () => {
    for (const b of [BIOME_TEMPERATE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH]) expect(new Set(NEARBY[b]).size).toBeGreaterThanOrEqual(4);
    expect(SEEN_MIN).toBeGreaterThanOrEqual(5);
    expect(VISITORS).toBeGreaterThanOrEqual(4);
  });
});

describe('faune : la mer', () => {
  it('le continent a un large, et des dauphins y vivent (le seuil de profondeur n’en trouvait aucun)', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.updateVis();
    const open = openSea(w, OPEN_SEA);
    expect(open.length).toBeGreaterThan(100);
    for (const k of open) expect(w.cellAvg(k % N, Math.floor(k / N))).toBeLessThan(-0.12);
    const f = new Fauna(w, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    f.update(0.016, 0, 12, 0, 0, 0);
    const kinds = new Set((f as any).critters.map((c: any) => c.kind));
    expect(kinds.has('dolphin')).toBe(true);
    expect(kinds.has('fish')).toBe(true);
    expect(kinds.has('shark')).toBe(true);
    // la mer devant le village (ici le milieu de la carte, sans feu de camp) : dauphins, requin et bancs à moins de COAST_REACH
    const coast = (f as any).critters.filter((c: any) => c.key.startsWith('coast'));
    for (const k of ['coastD0', 'coastS0', 'coastF0']) expect(coast.some((c: any) => c.key === k), k).toBe(true);
    for (const c of coast) expect(Math.hypot(c.hx - N / 2, c.hz - N / 2)).toBeLessThan(COAST_REACH + 16);
    // l'hiver : un groupe de dauphins sur deux reste (clés en 0), les autres partent
    for (let i = 0; i < 20; i++) f.update(0.05, i * 0.05, 12, 3, 0, 0);
    const dol = (f as any).critters.filter((c: any) => c.kind === 'dolphin');
    expect(dol.filter((c: any) => !c.key.endsWith('0')).every((c: any) => c.hidden)).toBe(true);
    expect(dol.some((c: any) => c.key.endsWith('0') && !c.hidden)).toBe(true);
    setMapSize(96);
  });

  it('la nage est fluide : ni saut de position, ni virage sec, ni à-coup de hauteur, même quand le monde change', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.updateVis();
    const f = new Fauna(w, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    const sea = () => (f as any).critters.filter((c: any) => ['fish', 'dolphin', 'shark'].includes(c.kind));
    f.update(0.016, 0, 12, 1, 0, 0);
    let prev = new Map(sea().map((c: any) => [c, { x: c.x, z: c.z, y: c.y, h: c.heading }]));
    let worst = { d: 0, h: 0, y: 0 };
    for (let i = 1; i < 600; i++) {
      // un bâtiment posé ailleurs : nouveau recensement (qui remettait les bancs chassés à leur domaine d'un coup)
      if (i % 150 === 0) w.version++;
      f.update(1 / 60, i / 60, 12, 1, 0, 0);
      for (const c of sea()) {
        const p = prev.get(c);
        if (!p) continue;
        let dh = Math.abs(c.heading - p.h) % (Math.PI * 2);
        if (dh > Math.PI) dh = Math.PI * 2 - dh;
        worst = { d: Math.max(worst.d, Math.hypot(c.x - p.x, c.z - p.z)), h: Math.max(worst.h, dh), y: Math.max(worst.y, Math.abs(c.y - p.y)) };
      }
      prev = new Map(sea().map((c: any) => [c, { x: c.x, z: c.z, y: c.y, h: c.heading }]));
    }
    // à 60 images/s : moins de 0,1 case, 0,2 radian, 0,06 de hauteur par image
    expect(worst.d).toBeLessThan(0.1);
    expect(worst.h).toBeLessThan(0.2);
    expect(worst.y).toBeLessThan(0.06);
    setMapSize(96);
  });

  it('les bêtes de la mer viennent près du village à tout âge', () => {
    for (const age of [0, 2, 3, 5]) for (const k of ['fish', 'dolphin', 'shark'] as const) expect(nearbyAllowed(k, age)).toBe(true);
    expect(nearbyAllowed('deer', 3)).toBe(false);
  });
});
