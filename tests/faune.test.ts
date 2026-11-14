import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, VEG_CAVE, VEG_FOREST, BIOME_DESERT, BIOME_MARSH, BIOME_TAIGA, BIOME_TROPICAL, BIOME_TEMPERATE } from '../src/world/world';
import { speciesIn, bearDens, ZONES, Fauna, villageCenter, NEARBY, VILLAGE_RING, SEEN_MIN, SEEN_R, VISITORS, wantsVisitors, openSea, OPEN_SEA, COAST_REACH, nearbyAllowed, habitatOk, seaMask, seaRoom } from '../src/render/fauna';
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

  it('chaque bête sauvage reste dans son milieu : ni cerf au désert, ni éléphant sous les arbres', () => {
    const w = new World();
    w.heights.fill(1);
    w.computeBiomes();
    // moitié ouest tempérée, moitié est désertique ; une forêt tropicale au sud
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) w.biome[w.ci(x, z)] = z > 70 ? BIOME_TROPICAL : x < N / 2 ? BIOME_TEMPERATE : BIOME_DESERT;
    for (let z = 80; z < 90; z++) for (let x = 10; x < 20; x++) w.veg[w.ci(x, z)] = VEG_FOREST;
    expect(habitatOk(w, 'deer', 10, 10)).toBe(true);
    expect(habitatOk(w, 'deer', 70, 10)).toBe(false);
    expect(habitatOk(w, 'camel', 70, 10)).toBe(true);
    expect(habitatOk(w, 'camel', 10, 10)).toBe(false);
    expect(habitatOk(w, 'elephant', 40, 80)).toBe(true);
    expect(habitatOk(w, 'elephant', 15, 85)).toBe(false);
    expect(habitatOk(w, 'elephant', 10, 10)).toBe(false);
    // le lapin, lui, va partout
    expect(habitatOk(w, 'rabbit', 70, 10)).toBe(true);
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

  it('la baleine nage lentement, en très larges virages, sans zigzag ni à-coup, sur tout un cycle de respiration', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.updateVis();
    const f = new Fauna(w, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    f.update(0.016, 0, 12, 1, 0, 0);
    // (sans son modèle, les tests n'ont pas de baleine : on en pose une, comme le recensement, au plus large de la mer)
    const room = seaRoom(w, 10);
    let home = 0;
    for (let k = 0; k < N * N; k++) if (room[k] > room[home]) home = k;
    const d = (f as any).critters.find((c: any) => c.kind === 'dolphin');
    const whale = { ...d, kind: 'whale', key: 'whaleT0', slot: 0, hx: (home % N) + 0.5, hz: Math.floor(home / N) + 0.5, radius: 7, seaT: undefined, glide: 0, rush: 0, actor: null, every: undefined, lag: 0 };
    (f as any).critters.push(whale);
    let p = { x: whale.x, z: whale.z, y: whale.y, h: whale.heading, pi: whale.pitch };
    const worst = { turn: 0, vMin: 9, vMax: 0, vy: 0, pitch: 0 };
    let yMin = 9, yMax = -9;
    const dt = 1 / 30;
    for (let i = 1; i < 1100; i++) {
      f.update(dt, i * dt, 12, 1, 0, 0);
      if (i > 60) {
        let dh = whale.heading - p.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const v = Math.hypot(whale.x - p.x, whale.z - p.z) / dt;
        worst.turn = Math.max(worst.turn, Math.abs(dh) / dt);
        worst.vMin = Math.min(worst.vMin, v); worst.vMax = Math.max(worst.vMax, v);
        worst.vy = Math.max(worst.vy, Math.abs(whale.y - p.y) / dt);
        worst.pitch = Math.max(worst.pitch, Math.abs(whale.pitch - p.pi) / dt);
        yMin = Math.min(yMin, whale.y); yMax = Math.max(yMax, whale.y);
      }
      p = { x: whale.x, z: whale.z, y: whale.y, h: whale.heading, pi: whale.pitch };
    }
    // des virages très larges (0,08 rad/s au plus), une allure lente qui varie un peu (0,25 case/s ± le rythme)
    expect(worst.turn).toBeLessThan(0.1);
    expect(worst.vMin).toBeGreaterThan(0.12);
    expect(worst.vMax).toBeLessThan(0.34);
    // elle remonte respirer puis replonge, en douceur
    expect(yMax - yMin).toBeGreaterThan(0.4);
    expect(worst.vy).toBeLessThan(0.6);
    expect(worst.pitch).toBeLessThan(0.6);
    setMapSize(96);
  });

  it('une nage naturelle : les dauphins sautent et plongent vraiment, les trajectoires ne sont plus des cercles, les bancs se déforment', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.updateVis();
    const f = new Fauna(w, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    f.update(0.016, 0, 12, 1, 0, 0);
    const all = () => (f as any).critters as any[];
    const dol = all().find((c) => c.key === 'coastD0' && c.slot === 0) ?? all().find((c) => c.kind === 'dolphin' && c.slot === 0);
    const shark = all().find((c) => c.kind === 'shark');
    const school = all().filter((c) => c.key === all().find((x) => x.kind === 'fish' && x.slot === 0).key);
    const dy = { min: 9, max: -9, deep: 0, entries: 0, headFirst: 0 };
    const turns = { pos: 0, neg: 0, pinned: 0 }, fishTurn = { pos: 0, neg: 0 }, sp: number[] = [], spread: number[] = [];
    let far = 0, wasAir = false, p = { x: shark.x, z: shark.z };
    const dt = 1 / 30;
    for (let i = 1; i < 1200; i++) {
      f.update(dt, i * dt, 12, 1, 0, 0);
      if (i < 30) { p = { x: shark.x, z: shark.z }; continue; }
      dy.min = Math.min(dy.min, dol.y); dy.max = Math.max(dy.max, dol.y);
      if (dol.y < -0.45) dy.deep += dt;
      const air = dol.y > 0.06;
      if (wasAir && !air) dy.entries++;
      if (air && dol.y < 0.3 && dol.pitch > 0.8) dy.headFirst++;
      wasAir = air;
      if (shark.turnV > 0.02) turns.pos++;
      if (shark.turnV < -0.02) turns.neg++;
      if (Math.abs(shark.turnV) > 0.2) turns.pinned++;
      for (const c of all()) if (c.kind === 'fish' && c.slot === 0) { if (c.turnV > 0.02) fishTurn.pos++; if (c.turnV < -0.02) fishTurn.neg++; }
      sp.push(Math.hypot(shark.x - p.x, shark.z - p.z) / dt);
      p = { x: shark.x, z: shark.z };
      far = Math.max(far, Math.hypot(shark.x - shark.hx, shark.z - shark.hz) / shark.radius);
      const cx = school.reduce((a, c) => a + c.x, 0) / school.length, cz = school.reduce((a, c) => a + c.z, 0) / school.length;
      spread.push(school.reduce((a, c) => a + Math.hypot(c.x - cx, c.z - cz), 0) / school.length);
    }
    // 40 s : les dauphins sortent de l'eau d'au moins 0,4, plongent sous 0,5 (le fond peut les arrêter), restent au fond plusieurs secondes,
    // sautent souvent, et retombent tête la première
    expect(dy.max).toBeGreaterThan(0.4);
    expect(dy.min).toBeLessThan(-0.5);
    expect(dy.deep).toBeGreaterThan(4);
    expect(dy.entries).toBeGreaterThanOrEqual(6);
    expect(dy.headFirst).toBeGreaterThan(0);
    // le requin vire dans les deux sens, change d'allure, et reste près de son domaine
    expect(turns.pos).toBeGreaterThan(20);
    expect(turns.neg).toBeGreaterThan(20);
    // et ne tourne pas en rond au plus serré de son virage
    expect(turns.pinned / 1170).toBeLessThan(0.3);
    expect(Math.max(...sp) - Math.min(...sp)).toBeGreaterThan(0.08);
    expect(far).toBeLessThan(2.5);
    // les bancs virent des deux côtés (ils revenaient autrefois vers leur petit domaine toujours du même côté)
    expect(Math.min(fishTurn.pos, fishTurn.neg) / Math.max(fishTurn.pos, fishTurn.neg)).toBeGreaterThan(0.3);
    // le banc respire : son étalement varie
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.05);
    setMapSize(96);
  });

  it('les bêtes marines restent en mer : jamais dans un lac, même grand et profond ; les poissons, si', () => {
    setMapSize(96);
    const MARINE = ['dolphin', 'whale', 'manta', 'shark'];
    // la terre partout, sauf un grand lac en anneau autour d'une île au milieu (sans lien avec le bord de la carte)
    const w = new World(), V = N + 1;
    for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
      const d = Math.hypot(x - 48, z - 48);
      w.heights[z * V + x] = d > 8 && d < 34 ? -1.3 : 1;
    }
    w.computeBiomes();
    w.biome.fill(BIOME_TEMPERATE);
    expect(seaMask(w).some((v) => v)).toBe(false);
    expect(openSea(w, OPEN_SEA)).toEqual([]);
    const f = new Fauna(w, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    // la vue sur le lac : les visiteurs (bancs, et dauphins sur l'eau libre de la mer) peuvent venir
    const cam = new THREE.PerspectiveCamera(50, 1.5, 0.1, 500);
    cam.position.set(52, 10, 28);
    cam.lookAt(48, 0, 24);
    cam.updateMatrixWorld();
    for (let i = 0; i < 200; i++) f.update(0.05, i * 0.05, 12, 1, 0, 0, cam);
    const all = (f as any).critters;
    expect(all.filter((c: any) => MARINE.includes(c.kind))).toEqual([]);
    expect(all.some((c: any) => c.kind === 'fish')).toBe(true);

    // et sur le continent : chaque bête marine nage sur une case de mer, jamais sur une case de lac
    setMapSize(192);
    const c = new World();
    newWorld(c, 3, 2026, GEN);
    c.updateVis();
    const sea = seaMask(c);
    const g = new Fauna(c, { perches: Array.from({ length: N * N }, () => []), flowers: Array.from({ length: N * N }, () => []) });
    for (let i = 0; i < 60; i++) g.update(0.05, i * 0.05, 12, 1, 0, 0);
    const marine = (g as any).critters.filter((x: any) => MARINE.includes(x.kind));
    expect(marine.length).toBeGreaterThan(0);
    for (const x of marine) {
      expect(sea[c.ci(Math.floor(x.hx), Math.floor(x.hz))], `${x.key} domaine`).toBe(1);
      if (!x.hidden) expect(sea[c.ci(Math.floor(x.x), Math.floor(x.z))], `${x.key}`).toBe(1);
    }
    setMapSize(96);
  });

  it('les bêtes de la mer viennent près du village à tout âge', () => {
    for (const age of [0, 2, 3, 5]) for (const k of ['fish', 'dolphin', 'shark'] as const) expect(nearbyAllowed(k, age)).toBe(true);
    expect(nearbyAllowed('deer', 3)).toBe(false);
  });
});
