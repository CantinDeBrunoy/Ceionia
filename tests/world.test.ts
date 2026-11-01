import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, MAX_H, MIN_H, setMapSize, VEG_FIELD, VEG_GARDEN } from '../src/world/world';
import { findGardens, layoutGarden } from '../src/world/gardens';
import { genHeights, newWorld, MAPS } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot } from '../src/build/placement';
import { MISSIONS, mandatoryFor, applyEffects, needBonus } from '../src/sim/missions';
import { Expeditions, Report, partyLimit } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';

/** Carte de l'île, toujours la même graine : les tests ne dépendent pas du hasard */
function island() {
  setMapSize(96);
  const w = new World();
  newWorld(w, 0, 1234);
  w.updateVis();
  return w;
}

/** Première case de terre plate (au moins `h` de haut) entourée de terre, pour y poser un bâtiment */
function flatLand(w: World, h = 0.6) {
  for (let z = 10; z < N - 10; z++)
    for (let x = 10; x < N - 10; x++)
      if (w.cellAvg(x, z) > h && w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null) return [x, z];
  throw new Error('pas de terrain plat');
}

describe('génération des cartes', () => {
  it('une même graine donne toujours le même relief', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const a = genHeights(m.id, 42), b = genHeights(m.id, 42);
      expect(a).toEqual(b);
      expect(genHeights(m.id, 43)).not.toEqual(a);
    }
  });

  it('le relief reste dans ses bornes et les montagnes sont hautes', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const h = genHeights(m.id, m.defaultSeed);
      let lo = Infinity, hi = -Infinity;
      for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      // hauteurs stockées en flottants 32 bits
      expect(lo).toBeGreaterThanOrEqual(Math.fround(MIN_H));
      expect(hi).toBeLessThanOrEqual(MAX_H);
      expect(hi).toBeGreaterThan(8);
    }
  });
});

describe('sauvegarde', () => {
  let w: World;
  beforeAll(() => { w = island(); });

  it('relit exactement ce qu’elle a écrit (relief, végétation, bâtiments, lave, cendres, minerai)', () => {
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 1, false);
    w.basalt[w.ci(5, 5)] = 0.42;
    w.ash[w.ci(6, 6)] = 1;
    w.ore = 17;
    w.mined.add(123);
    const data = JSON.parse(JSON.stringify(w.toJSON()));
    const r = new World();
    r.fromJSON(data);
    for (let i = 0; i < w.heights.length; i++) expect(r.heights[i]).toBeCloseTo(w.heights[i], 1);
    expect(Array.from(r.veg)).toEqual(Array.from(w.veg));
    expect([...r.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age])).toEqual([...w.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age]));
    expect(r.basalt[r.ci(5, 5)]).toBeCloseTo(0.42, 2);
    expect(r.ash[r.ci(6, 6)]).toBe(1);
    expect(r.ore).toBe(17);
    expect(r.mined.has(123)).toBe(true);
  });

  it('refuse une sauvegarde d’une autre taille de carte', () => {
    const data = w.toJSON();
    expect(() => new World().fromJSON({ ...data, n: 48 })).toThrow();
  });

  it('lit une ancienne sauvegarde sans lave, cendres ni minerai', () => {
    const { basalt, ash, ore, mined, ...old } = w.toJSON();
    void basalt; void ash; void ore; void mined;
    const r = new World();
    r.fromJSON(old);
    expect(r.ore).toBe(0);
    expect(r.ash.every((v) => v === 0)).toBe(true);
  });
});

describe('eau', () => {
  let w: World;
  beforeAll(() => { w = island(); });

  const findCell = (test: (x: number, z: number) => boolean) => {
    for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) if (test(x, z)) return [x, z];
    throw new Error('case introuvable');
  };

  it('une route franchit l’eau peu profonde sur un pont, pas le large', () => {
    const [sx, sz] = findCell((x, z) => w.cellAvg(x, z) < -0.3 && w.cellAvg(x, z) > -1.2);
    expect(w.canRoad(sx, sz)).toBe(true);
    expect(w.setRoad(sx, sz, true)).toBe(true);
    expect(w.bridgeY(sx, sz)).toBeGreaterThan(0.2);
    expect(w.surfaceAt(sx + 0.5, sz + 0.5)).toBeGreaterThan(0.2);
    const [dx, dz] = findCell((x, z) => w.cellAvg(x, z) < -1.9);
    expect(w.canRoad(dx, dz)).toBe(false);
  });

  it('le ponton de pêche se pose au bord de l’eau, pas dans les terres', () => {
    const [ix, iz] = flatLand(w, 1.5);
    expect(w.canPlace('pier', ix, iz)).not.toBeNull();
    const shore = findCell((x, z) => w.cellAvg(x, z) > 0.1 && w.cellSlope(x, z) < 0.5 && !w.occ[w.ci(x, z)] && !w.road[w.ci(x, z)] && !w.decor[w.ci(x, z)]
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => w.cellAvg(x + a, z + b) < -0.3));
    expect(w.canPlace('pier', shore[0], shore[1])).toBeNull();
  });

  it('on ne bâtit pas sur un lac', () => {
    const [x, z] = flatLand(w);
    const cells = new Uint8Array(N * N), level = new Float32Array(N * N);
    cells[w.ci(x, z)] = 1; level[w.ci(x, z)] = 3;
    w.setLakes(cells, level);
    expect(w.canPlace('house', x, z)).toBe('Un lac est ici');
    w.setLakes(new Uint8Array(N * N), new Float32Array(N * N));
  });
});

describe('volcans et récoltes', () => {
  it('la lave détruit un bâtiment seulement si les catastrophes sont activées', () => {
    const w = island();
    const [x, z] = flatLand(w);
    const b = w.place('house', x, z, 0, true, 1, false);
    w.disasters = false;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(true);
    w.disasters = true;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(false);
    expect(w.losses.length).toBe(1);
    expect(w.ash[w.ci(x, z)]).toBe(1);
  });

  it('un champ sur des cendres donne double récolte, la sécheresse la réduit', () => {
    const w = island();
    const [x, z] = flatLand(w);
    w.veg[w.ci(x, z)] = VEG_FIELD;
    const sim = new Sim(w);
    const food = (moisture: number) => { sim.moisture = moisture; sim.recalc(); sim.update(0, 1); return sim.food.cap; };
    const normal = food(1);
    w.ash[w.ci(x, z)] = 1;
    const fertile = food(1);
    expect(fertile).toBeCloseTo(normal * 2, 5);
    expect(food(0)).toBeLessThan(fertile * 0.6);
  });

  it('l’âge industriel demande du minerai', () => {
    const w = island();
    const sim = new Sim(w);
    sim.age = 2;
    const ore = () => sim.ageProgress()!.items.find((i) => i.label.startsWith('minerai'))!;
    expect(ore().need).toBeGreaterThan(0);
    w.ore = 99;
    expect(ore().have).toBe(99);
  });
});

describe('routes automatiques', () => {
  /** Une bande de terre plate de `len` cases vers l'est (sur trois de large), débroussaillée pour y bâtir */
  function strip(w: World, len: number, from = 10) {
    for (let z = from; z < N - 10; z++)
      for (let x = 10; x < N - 10 - len; x++) {
        let ok = true;
        for (let i = 0; i <= len && ok; i++) for (let j = -1; j <= 1 && ok; j++)
          ok = w.cellAvg(x + i, z + j) > 0.5 && w.cellSlope(x + i, z + j) < 0.6 && !w.occ[w.ci(x + i, z + j)] && !w.road[w.ci(x + i, z + j)] && !w.isWet(x + i, z + j);
        if (!ok) continue;
        for (let i = 0; i <= len; i++) for (let j = -1; j <= 1; j++) { w.veg[w.ci(x + i, z + j)] = 0; w.decor[w.ci(x + i, z + j)] = 0; }
        return [x, z];
      }
    throw new Error('pas de bande plate');
  }
  const roads = (w: World) => w.road.reduce((n, v) => n + (v ? 1 : 0), 0);

  it('relie un bâtiment au voisin par un chemin court, rien de plus', () => {
    const w = island();
    const [x, z] = strip(w, 8);
    // le tout premier bâtiment n'a personne à rejoindre
    expect(autoRoad(w, w.place('house', x, z, 0, true, 0, false))).toBe(0);
    const n = autoRoad(w, w.place('house', x + 6, z, 0, true, 0, false));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(7);
    // un bâtiment qui touche déjà la route n'en pose pas
    const r = w.road.findIndex((v) => v === 1);
    const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => [r % N + a, Math.floor(r / N) + b]).find(([a, b]) => w.canPlace('house', a, b) === null)!;
    const before = roads(w);
    expect(autoRoad(w, w.place('house', spot[0], spot[1], 0, true, 0, false))).toBe(0);
    expect(roads(w)).toBe(before);
  });

  it('ne trace rien pour un lampadaire ni vers un bâtiment trop loin', () => {
    const w = island();
    const [x, z] = strip(w, 8);
    w.place('house', x, z, 0, true, 0, false);
    expect(autoRoad(w, w.place('lamp', x + 4, z, 0, true, 0, false))).toBe(0);
    const [fx, fz] = strip(w, 2, z + 25);
    expect(autoRoad(w, w.place('house', fx, fz, 0, true, 0, false))).toBe(0);
    expect(roads(w)).toBe(0);
  });
});

describe('façades et ponts', () => {
  it('la façade regarde le côté qui longe le plus la route, sinon la route la plus proche', () => {
    const w = island();
    const [x, z] = flatLand(w);
    const road = (cx: number, cz: number) => { w.road[w.ci(cx, cz)] = 1; };
    w.road.fill(0);
    // gare ou château (2 × 2) : une case de route devant (+z), deux à l'ouest (-x) : il se tourne vers l'ouest
    road(x, z + 2); road(x - 1, z); road(x - 1, z + 1);
    expect(facingRoadRot(w, 'landmark', x, z, 0)).toBe(3);
    // à égalité, il garde son orientation
    w.road.fill(0);
    road(x, z + 2); road(x + 2, z);
    expect(facingRoadRot(w, 'landmark', x, z, 1)).toBe(1);
    expect(facingRoadRot(w, 'landmark', x, z, 0)).toBe(0);
    // aucune route contre la maison : la plus proche, à l'est, décide ; trop loin, rien ne change
    w.road.fill(0);
    road(x + 3, z);
    expect(facingRoadRot(w, 'house', x, z, 2)).toBe(1);
    w.road.fill(0);
    road(x + 7, z);
    expect(facingRoadRot(w, 'house', x, z, 2)).toBe(2);
  });

  it('un service posé en 1 × 1 dans une ancienne sauvegarde grandit en 2 × 2 sur une place libre voisine', () => {
    const w = island();
    const [x, z] = flatLand(w);
    // une maison à l'est empêche de grandir vers l'est : la caserne s'étend vers l'ouest ou le nord
    w.place('house', x + 1, z, 0, true, 0, false);
    const d = w.toJSON();
    d.buildings.push(['fire', x, z, 0, 1, 0]);
    const w2 = new World();
    w2.fromJSON(d);
    const f = [...w2.buildings.values()].find((b) => b.kind === 'fire')!;
    expect(f).toBeTruthy();
    expect(f.x <= x && x <= f.x + 1 && f.z <= z && z <= f.z + 1).toBe(true);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) expect(w2.occ[w2.ci(f.x + i, f.z + j)]).toBe(f.id);
    expect(w2.losses).toEqual([]);
  });

  it('sur un pont, on coupe les virages ; ailleurs, on passe au centre des cases', () => {
    const w = island();
    let L: number[] | null = null;
    for (let z = 2; z < N - 3 && !L; z++) for (let x = 2; x < N - 3 && !L; x++) if (w.isWet(x, z) && w.isWet(x + 1, z) && w.isWet(x + 1, z + 1)) L = [x, z];
    const [x, z] = L!;
    const path = [w.ci(x, z), w.ci(x + 1, z), w.ci(x + 1, z + 1)];
    expect(w.passPoint(path, 1)).toEqual([x + 1.5, z + 0.5]);
    for (const c of path) w.road[c] = 1;
    expect(w.bridgeY(x + 1, z)).not.toBeNull();
    expect(w.passPoint(path, 1)).toEqual([x + 1.25, z + 0.75]);
    // tout droit ou au bout du trajet : le centre
    expect(w.passPoint(path, 0)).toEqual([x + 0.5, z + 0.5]);
    expect(w.passPoint(path, 2)).toEqual([x + 1.5, z + 1.5]);
  });
});

describe('jardins', () => {
  /** Un jardin rectangulaire de w × d cases peint sur de la terre plate et dégagée */
  function garden(w: World, gw: number, gd: number) {
    for (let z = 8; z < N - 8 - gd; z++)
      for (let x = 8; x < N - 8 - gw; x++) {
        let ok = true;
        for (let i = 0; i < gw && ok; i++) for (let j = 0; j < gd && ok; j++) ok = w.cellAvg(x + i, z + j) > 0.5 && w.cellSlope(x + i, z + j) < 0.6 && !w.occ[w.ci(x + i, z + j)] && !w.road[w.ci(x + i, z + j)] && !w.isWet(x + i, z + j);
        if (!ok) continue;
        for (let i = 0; i < gw; i++) for (let j = 0; j < gd; j++) { w.veg[w.ci(x + i, z + j)] = VEG_GARDEN; w.decor[w.ci(x + i, z + j)] = 0; }
        return findGardens(w).find((g) => g.set.has(w.ci(x, z)))!;
      }
    throw new Error('pas de place pour un jardin');
  }

  it('change de visage à chaque âge, toujours le même pour une zone donnée', () => {
    const w = island(), g = garden(w, 4, 3);
    const styles = [0, 1, 2, 3, 4].map((a) => layoutGarden(w, g, a).style);
    expect(styles[0]).toBe('camp');
    expect(styles[1]).toBe('antique');
    expect(styles[4]).toBe('parc');
    expect(new Set(styles).size).toBe(5);
    expect(layoutGarden(w, g, 2)).toEqual(layoutGarden(w, g, 2));
  });

  it('se remplit selon la taille et reste dans la zone', () => {
    const w = island(), small = garden(w, 2, 1), big = garden(w, 6, 5);
    for (let a = 0; a <= 4; a++) {
      const s = layoutGarden(w, small, a), b = layoutGarden(w, big, a);
      expect(b.items.length).toBeGreaterThan(s.items.length);
      for (const l of [s, b]) for (const it of l.items) expect(l.g.set.has(w.ci(Math.floor(it.x), Math.floor(it.z)))).toBe(true);
      expect(b.spots.length).toBeGreaterThan(0);
    }
    // préhistoire : des feux et des places assises autour ; époque moderne : des jeux pour les enfants
    expect(layoutGarden(w, big, 0).items.filter((i) => i.k === 'fire').length).toBeGreaterThan(0);
    expect(layoutGarden(w, big, 0).spots.some((s) => s.act === 'sit')).toBe(true);
    expect(layoutGarden(w, big, 4).spots.some((s) => s.kid && s.act === 'play')).toBe(true);
  });

  it('un jardin long accueille un tournoi au Moyen Âge, un petit des lices d’entraînement', () => {
    const w = island(), long = garden(w, 8, 3), small = garden(w, 2, 2);
    const t = layoutGarden(w, long, 2);
    expect(t.style).toBe('tournoi');
    expect(t.lanes.length).toBe(4);
    expect(t.spots.some((s) => s.act === 'cheer')).toBe(true);
    expect(layoutGarden(w, small, 2).style).toBe('lices');
  });
});

describe('expéditions', () => {
  it('chaque âge a une expédition obligatoire, et des choix bien formés', () => {
    for (let age = 0; age < 5; age++) {
      expect(MISSIONS.filter((m) => m.age === age && m.mandatory).length).toBe(1);
      expect(mandatoryFor(age)).not.toBeNull();
    }
    for (const m of MISSIONS) {
      expect(m.choices.length).toBeGreaterThan(0);
      for (const c of m.choices) {
        expect(c.party).toBeGreaterThanOrEqual(2);
        expect(c.risk).toBeGreaterThanOrEqual(0);
        expect(c.risk).toBeLessThan(1);
        expect(c.win.length).toBeGreaterThan(0);
      }
    }
  });

  it('l’expédition obligatoire conditionne l’âge suivant', () => {
    const w = island(), sim = new Sim(w);
    const item = () => sim.ageProgress()!.items.find((i) => i.label.startsWith('expédition'))!;
    expect(item().have).toBe(0);
    w.exp.done.push(mandatoryFor(0)!.id);
    expect(item().have).toBe(1);
  });

  it('les effets s’appliquent : bêtes, minerai, savoir-faire, bonus durables et passagers', () => {
    const w = island(), sim = new Sim(w);
    const [x, z] = flatLand(w);
    w.place('farm', x, z, 0, true, 0, false);
    sim.recalc(); sim.update(0, 1);
    const before = sim.food.cap;
    const r = applyEffects(w, [{ t: 'herd', kinds: ['sheep', 'sheep'] }, { t: 'ore', n: 5 }, { t: 'need', need: 'food', n: 3 }, { t: 'need', need: 'joy', n: 2, days: 1 }, { t: 'injured', n: 1, days: 2 }], 100);
    expect(w.exp.herd).toEqual(['sheep', 'sheep']);
    expect(w.ore).toBe(5);
    expect(r).toEqual({ injured: 1, days: 2 });
    sim.update(0, 1);
    expect(sim.food.cap).toBeCloseTo(before + 3, 5);
    expect(needBonus(w.exp, 'joy')).toBe(2);
    // un jour plus tard, l'effet passager s'est éteint
    sim.update(101, 1);
    expect(needBonus(w.exp, 'joy')).toBe(0);
    // et tout se retrouve à la relecture de la sauvegarde
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.exp.herd.length).toBe(2);
    expect(w2.exp.bonus.food).toBe(3);
  });

  it('une équipe part, revient, et l’issue s’applique', () => {
    const w = island();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 12, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const m = mandatoryFor(0)!;
    expect(ex.start(m, 0)).not.toBeNull();
    let report: Report | null = null;
    ex.onReport = (r) => (report = r);
    const phases = new Set<string>();
    for (let i = 0; i < 40000 && !report; i++) { agents.update(0.05, 10, 0, false, 12, 0); ex.update(0.05); if (ex.active[0]) phases.add(ex.active[0].phase); }
    expect([...phases]).toEqual(['gather', 'out', 'work', 'back', 'home']);
    expect(report!.ok).toBe(true);
    expect(w.exp.done).toContain(m.id);
    expect(w.exp.herd.length).toBeGreaterThan(0);
    expect(agents.available()).toBeGreaterThanOrEqual(m.choices[0].party);
  });

  it('plus le village est peuplé, plus il mène d’expéditions de front', () => {
    expect([0, 29, 30, 59, 60, 90, 500].map(partyLimit)).toEqual([1, 1, 2, 2, 3, 4, 4]);
    const w = island();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 14, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.5);
    const [a, b] = MISSIONS.filter((q) => q.age === 0);
    // une seule équipe à moins de trente habitants
    ex.pop = () => 12;
    expect(ex.start(a, 0)).not.toBeNull();
    expect(ex.why(b, b.choices[0])).toMatch(/équipes sont en route/);
    // la même mission ne part pas deux fois ; à trente habitants, une deuxième équipe peut partir
    ex.pop = () => 30;
    expect(ex.why(a, a.choices[1])).toMatch(/déjà en route/);
    const second = ex.start(b, 0);
    expect(second).not.toBeNull();
    expect(ex.active.map((e) => e.id)).toEqual([1, 2]);
    // une école rend les choix plus sûrs
    const risk = ex.riskOf(a.choices[2]);
    const [sx, sz] = flatLand(w);
    w.place('school', sx, sz, 0, true, 0, false);
    expect(ex.riskOf(a.choices[2])).toBeCloseTo(risk * 0.7);
  });
});
