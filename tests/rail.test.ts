import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { AGES, KINDS, KindId, Building } from '../src/build/catalog';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { Railway, isTerminus, LANES } from '../src/sim/railway';
import { MISSIONS } from '../src/sim/missions';
import { BRICK_PRICE, CAR_FUEL, YIELD } from '../src/sim/economy';
import { gap, railBoost, railNet, servedStations, spaceRail, railWant, FREIGHT_BONUS, RAIL_REACH } from '../src/sim/freight';
import { getModel } from '../src/render/models';
import { Sim, reqKindsOf, RAIL_FIRST, RAIL_LINKED } from '../src/sim/sim';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première place où poser ce bâtiment, en partant du coin (x0, z0) */
function spot(w: World, kind: KindId, x0 = 10, z0 = 10): [number, number] {
  for (let z = z0; z < N - 10; z++) for (let x = x0; x < N - 10; x++) if (w.canPlace(kind, x, z) === null) return [x, z];
  throw new Error(`pas de place pour ${kind}`);
}

const B = (kind: KindId, x: number, z: number): Building => ({ id: 0, kind, x, z, rot: 0, auto: true, age: 3 });

describe('le rail au service du village', () => {
  it('la distance entre deux bâtiments se compte en cases vides, d’un bord à l’autre', () => {
    expect(gap(B('quarry', 0, 0), B('station', 1, 0))).toBe(0);
    expect(gap(B('quarry', 0, 0), B('station', 4, 0))).toBe(3);
    expect(gap(B('station', 4, 9), B('quarry', 0, 0))).toBe(8);
    expect(railWant('brickworks')).toBe('freight');
    expect(railWant('spaceport')).toBe('passenger');
    expect(railWant('house')).toBeNull();
  });

  it('une gare desservie par un train de marchandises fait produire 75 % de plus la briqueterie voisine ; pas une gare de voyageurs, ni une ligne en panne', () => {
    const w = continent();
    const [x, z] = spot(w, 'brickworks', 40, 40);
    const bw = w.place('brickworks', x, z, 0, true, 3, false);
    const [sx, sz] = spot(w, 'station', x + 3, z);
    const st = w.place('station', sx, sz, 0, true, 3, false);
    const [fx, fz] = spot(w, 'station', x + 30, z + 30);
    const far = w.place('station', fx, fz, 0, true, 3, false);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    expect(gap(bw, st)).toBeLessThanOrEqual(RAIL_REACH);
    expect(ex.daily().brick).toBe(8);
    // une ligne de voyageurs : rien ne change
    w.lines.push({ id: 1, stops: [st.id, far.id], color: 0 });
    expect(servedStations(w, true)).toEqual([]);
    expect(ex.daily().brick).toBe(8);
    // de marchandises : +75 %
    w.lines[0].freight = true;
    expect(servedStations(w, true).map((b) => b.id).sort()).toEqual([st.id, far.id].sort());
    expect(railBoost(w, bw)).toBe(1 + FREIGHT_BONUS);
    expect(ex.daily().brick).toBe(14);
    // son train ne peut pas rouler : pas de bonus
    w.lines[0].ok = false;
    expect(ex.daily().brick).toBe(8);
    w.lines[0].ok = true;
    // la briqueterie trop loin de la gare : rien
    expect(railBoost(w, { ...bw, x: bw.x + 40 })).toBe(1);
  });

  it('un cosmodrome servi par une gare de voyageurs : expéditions spatiales plus sûres', () => {
    const w = continent();
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const rocket = MISSIONS.find((m) => m.id === 'rocket')!.choices[0];
    const [x, z] = spot(w, 'spaceport', 50, 50);
    const sp = w.place('spaceport', x, z, 0, true, 5, false);
    const [sx, sz] = spot(w, 'station', x + 4, z);
    const st = w.place('station', sx, sz, 0, true, 5, false);
    const [fx, fz] = spot(w, 'station', x + 30, z + 30);
    const far = w.place('station', fx, fz, 0, true, 5, false);
    expect(gap(sp, st)).toBeLessThanOrEqual(RAIL_REACH);
    const before = ex.riskOf(rocket);
    w.lines.push({ id: 1, stops: [st.id, far.id], color: 0, freight: true });
    expect(spaceRail(w)).toBe(false);
    w.lines[0].freight = false;
    expect(spaceRail(w)).toBe(true);
    expect(ex.riskOf(rocket)).toBeCloseTo(before * 0.75);
  });

  it('les lignes se sauvegardent avec leur genre (marchandises ou voyageurs)', () => {
    const w = continent();
    const a = w.place('station', ...spot(w, 'station', 40, 40), 0, true, 3, false);
    const b = w.place('station', ...spot(w, 'station', 60, 60), 0, true, 3, false);
    w.lines = [{ id: 1, stops: [a.id, b.id], color: 5, freight: true, ok: true }, { id: 2, stops: [b.id, a.id], color: 6 }];
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(r.lines.map((l) => !!l.freight)).toEqual([true, false]);
    expect(r.lines.every((l) => l.ok === undefined)).toBe(true);
  });
});

describe('la gare centrale', () => {
  it('très grande gare de brique de 3 × 3 à l’âge industriel, avec son modèle à chaque âge', () => {
    const d = KINDS.terminal;
    expect(d).toMatchObject({ size: 3, minAge: 3 });
    expect(d.names[3]).toBe('Gare centrale');
    expect(BRICK_PRICE.terminal).toBeGreaterThanOrEqual(30);
    for (const age of [3, 4, 5]) {
      const m = getModel('terminal', age, { v: 0, L: false, R: false, F: false });
      expect(m.body.attributes.position.count, `âge ${age}`).toBeGreaterThan(3000);
      m.body.computeBoundingBox();
      // toute son emprise, sans en sortir
      expect(m.body.boundingBox!.max.x).toBeLessThanOrEqual(1.52);
      expect(m.body.boundingBox!.min.z).toBeGreaterThanOrEqual(-1.52);
      expect(m.body.boundingBox!.max.x - m.body.boundingBox!.min.x).toBeGreaterThan(2.8);
    }
    // l'ancienne, restée en 2 × 2, garde un modèle
    expect(getModel('terminal', 3, { v: 0, L: false, R: false, F: false, small: true }).body.attributes.position.count).toBeGreaterThan(500);
  });

  it('trois voies en cul-de-sac : plusieurs lignes y sont à quai ensemble, chacune sur sa voie, et en sortent par l’arrière', () => {
    const w = continent();
    const agents = new Agents(w);
    const ex = new Expeditions(w, agents, () => 100, () => 0.5);
    const rail = new Railway(w, agents, ex, () => 100, () => 0.3);
    // une gare centrale, et des petites gares autour d'elle, là où une voie passe
    let term: Building | null = null;
    for (let z = 40; z < N - 40 && !term; z += 3) for (let x = 40; x < N - 40 && !term; x += 3) {
      if (w.canPlace('terminal', x, z) !== null) continue;
      term = w.place('terminal', x, z, 0, true, 3, false);
    }
    expect(term && isTerminus(term)).toBe(true);
    const lines: number[] = [];
    for (let k = 0; k < 40 && lines.length < 4; k++) {
      const a = (k / 40) * Math.PI * 2 * 3, r = 10 + (k % 5) * 2;
      const x = Math.round(term!.x + Math.cos(a) * r), z = Math.round(term!.z + Math.sin(a) * r);
      if (!w.inCells(x, z) || w.canPlace('station', x, z) !== null) continue;
      const s = w.place('station', x, z, 0, true, 3, false);
      const l = rail.addLine([term!.id, s.id]);
      if (rail.trains.get(l.id)!.why) { rail.removeLine(l.id); w.removeBuilding(s.id); continue; }
      lines.push(l.id);
    }
    expect(lines.length).toBeGreaterThanOrEqual(3);
    // chacune des trois premières a sa voie, la quatrième reprend celle du milieu
    const lanes = lines.map((id) => rail.trains.get(id)!.stops.find((s) => s.b.id === term!.id)!.lane);
    expect(new Set(lanes.slice(0, 3)).size).toBe(Math.min(3, LANES));
    // les voies partent par l'arrière de la halle : le bout de quai -1, jamais celui des butoirs
    for (const g of rail.network().segs) if (g.a === term!.id) expect(g.ea).toBe(-1); else if (g.b === term!.id) expect(g.eb).toBe(-1);
    // les trains y sont à quai ensemble
    let together = 0;
    for (let t = 0; t < 600; t++) {
      agents.update(0.5, 10, 3, false, 40, 0); ex.update(0.5); rail.update(0.5);
      const n = lines.filter((id) => { const tr = rail.trains.get(id)!; return tr.phase === 'dwell' && tr.stops[tr.at].b.id === term!.id; }).length;
      together = Math.max(together, n);
    }
    expect(together).toBeGreaterThanOrEqual(2);
  });

  it('une ligne qui dessert une briqueterie roule d’office en marchandises, et sans prendre de voyageurs', () => {
    const w = continent();
    const agents = new Agents(w);
    const ex = new Expeditions(w, agents, () => 100, () => 0.5);
    const rail = new Railway(w, agents, ex, () => 100, () => 0.3);
    const [x, z] = spot(w, 'brickworks', 40, 40);
    w.place('brickworks', x, z, 0, true, 3, false);
    const a = w.place('station', ...spot(w, 'station', x + 3, z), 0, true, 3, false);
    const b = w.place('station', ...spot(w, 'station', x + 30, z + 30), 0, true, 3, false);
    const l = rail.addLine([a.id, b.id]);
    expect(l.freight).toBe(true);
    for (let t = 0; t < 300; t++) { agents.update(0.5, 10, 3, false, 40, 0); rail.update(0.5); }
    expect(rail.trains.get(l.id)!.carried).toBe(0);
    rail.setFreight(l.id, false);
    expect(l.freight).toBeUndefined();
  });
});

describe('les conseils du rail', () => {
  it('une carrière sans gare de marchandises : le conseil propose une gare ; servie, il n’en parle plus ; voitures sans carburant : la raffinerie', () => {
    const w = continent();
    const sim = new Sim(w);
    sim.age = 3;
    for (const k of ['house', 'house', 'house', 'house', 'farm', 'farm', 'well', 'workshop', 'workshop', 'gather', 'health'] as KindId[]) w.place(k, ...spot(w, k, 60, 60), 0, true, 3, false);
    const [qx, qz] = spot(w, 'quarry', 30, 30);
    w.place('quarry', qx, qz, 0, true, 3, false);
    sim.recalc();
    sim.pop = 20;
    const say = () => { sim.pop = 20; return (sim as unknown as { computeMessage(): string }).computeMessage(); };
    // l'ordre : la briqueterie, puis la gare centrale, puis les petites gares
    expect(say()).toMatch(/^Pour le chemin de fer : bâtissez d’abord « Briqueterie »/);
    w.place('brickworks', ...spot(w, 'brickworks', 90, 30), 0, true, 3, false);
    sim.recalc();
    expect(say()).toMatch(/gare centrale|Gare centrale/);
    expect(sim.messageKind).toBe('terminal');
    w.place('terminal', ...spot(w, 'terminal', 30, 90), 0, true, 3, false);
    sim.recalc();
    expect(say()).toMatch(/^Astuce : posez « Petite gare »/);
    expect(sim.messageKind).toBe('station');
    // une gare de marchandises à côté : le village grandit, sans autre conseil
    const a = w.place('station', ...spot(w, 'station', qx + 2, qz), 0, true, 3, false);
    const b = w.place('station', ...spot(w, 'station', qx + 30, qz + 30), 0, true, 3, false);
    w.lines.push({ id: 1, stops: [a.id, b.id], color: 0, freight: true });
    sim.recalc();
    expect(say()).toMatch(/^Le village grandit/);
    // une usine automobile sans carburant ni raffinerie
    w.place('carworks', ...spot(w, 'carworks', 90, 90), 0, true, 3, false);
    sim.recalc();
    w.wood = w.stone = w.brick = 999;
    expect(say()).toMatch(/^Les voitures restent au garage, faute de carburant : « Raffinerie »/);
    w.fuel = 5;
    expect(say()).not.toMatch(/carburant/);
  });
});

describe('la raffinerie et le carburant', () => {
  it('une courte expédition de l’âge industriel la débloque ; elle vient avant l’usine automobile', () => {
    const m = MISSIONS.find((x) => x.id === 'oil')!;
    expect(m).toMatchObject({ age: 3, mandatory: true, unlocks: 'refinery' });
    expect(Math.max(...m.choices.map((c) => c.work))).toBeLessThanOrEqual(20);
    expect(KINDS.refinery).toMatchObject({ minAge: 3, reqMission: 'oil' });
    expect(KINDS.oilwell.minAge).toBe(3);
    expect(YIELD.oilwell!.crude![3]).toBeGreaterThan(0);
    expect(KINDS.carworks.reqKind).toBe('refinery');
  });

  it('les automobiles brûlent du carburant ; sans carburant, elles restent au garage', () => {
    const w = continent();
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    expect(ex.cars()).toBe(false);
    w.place('carworks', ...spot(w, 'carworks', 40, 40), 0, true, 3, false);
    expect(ex.cars()).toBe(false);
    w.fuel = 3;
    expect(ex.cars()).toBe(true);
    expect(ex.daily().fuel).toBe(-CAR_FUEL);
    for (let t = 0; t < 100; t++) ex.update(1);
    expect(w.fuel).toBeCloseTo(3 - CAR_FUEL, 1);
    for (let t = 0; t < 100; t++) ex.update(1);
    expect(w.fuel).toBe(0);
    expect(ex.cars()).toBe(false);
    w.unlimited = true;
    expect(ex.cars()).toBe(true);
  });
});

describe('fin de l’âge industriel : le pétrole, puis le chemin de fer', () => {
  /** Un village industriel : ses conditions, dans l'ordre ; le conseil du moment, tout le reste étant réuni */
  function village() {
    const w = continent();
    const sim = new Sim(w);
    sim.age = 3;
    w.wood = w.stone = w.brick = 999;
    w.place('house', ...spot(w, 'house', 120, 120), 0, true, 3, false);
    sim.recalc();
    const labels = () => sim.ageProgress()!.items.map((i) => i.label);
    const item = (label: string) => sim.ageProgress()!.items.find((i) => i.label === label)!;
    // seules restent les conditions qu'on veut voir : le reste est réuni
    const only = (keep: (l: string) => boolean) => { const real = Sim.prototype.ageProgress.bind(sim); sim.ageProgress = () => { const ap = real(); return { ...ap!, items: ap!.items.filter((i) => keep(i.label)) }; }; };
    const say = () => { sim.recalc(); sim.pop = AGES[4].reqPop; return (sim as unknown as { computeMessage(): string }).computeMessage(); };
    return { w, sim, labels, item, only, say };
  }
  const oilSpot = (w: World, n: number) => {
    const out: [number, number][] = [];
    for (let k = 0; k < N * N && out.length < n; k++) {
      const x = k % N, z = Math.floor(k / N);
      if (w.oil[k] && w.canPlace('oilwell', x, z) === null && !out.some(([a, b]) => Math.abs(a - x) < 2 && Math.abs(b - z) < 2)) out.push([x, z]);
    }
    return out;
  };

  it('l’époque moderne exige la raffinerie, des puits, une ligne et deux gares reliées, après les expéditions de l’âge', () => {
    expect(AGES[4].reqLate).toEqual({ refinery: 1, oilwell: 2 });
    expect(AGES[4].reqRail).toBe(true);
    for (const n of [1, 2, 3, 5]) { expect(AGES[n].reqLate, `âge ${n}`).toBeUndefined(); expect(AGES[n].reqRail).toBeFalsy(); }
    // en défi aussi : aucun âge d'avant ne les demandait
    expect(reqKindsOf(4, 'challenge', true)).toEqual({ refinery: 1, oilwell: 2 });
    const { labels } = village();
    const l = labels(), at = (s: string) => l.findIndex((x) => x.startsWith(s));
    expect(at('Raffinerie')).toBeGreaterThan(Math.max(at('expédition « Le tracé'), at('expédition « L’or noir')));
    expect(at('Puits de pétrole')).toBe(at('Raffinerie') + 1);
    expect(l.slice(-2)).toEqual([RAIL_FIRST, RAIL_LINKED]);
    // pas avant : le Moyen Âge n'en dit rien
    const { sim } = village();
    sim.age = 2;
    expect(sim.ageProgress()!.items.some((i) => i.label.startsWith('chemin de fer') || i.kind === 'refinery')).toBe(false);
  });

  it('le compte du chemin de fer : lignes en service, et le plus grand groupe de gares reliées', () => {
    const w = continent();
    const a = w.place('station', ...spot(w, 'station', 40, 40), 0, true, 3, false);
    const b = w.place('station', ...spot(w, 'station', 60, 60), 0, true, 3, false);
    const c = w.place('station', ...spot(w, 'station', 80, 40), 0, true, 3, false);
    expect(railNet(w)).toEqual({ lines: 0, linked: 0 });
    w.lines.push({ id: 1, stops: [a.id, b.id], color: 0 });
    expect(railNet(w)).toEqual({ lines: 1, linked: 2 });
    // la voie ne passe pas : rien
    w.lines[0].ok = false;
    expect(railNet(w)).toEqual({ lines: 0, linked: 0 });
    w.lines[0].ok = true;
    // une autre ligne part de b : un même réseau de trois gares
    w.lines.push({ id: 2, stops: [b.id, c.id], color: 1 });
    expect(railNet(w)).toEqual({ lines: 2, linked: 3 });
    // une gare démolie : sa ligne n'a plus qu'un arrêt
    w.removeBuilding(c.id);
    expect(railNet(w)).toEqual({ lines: 1, linked: 2 });
  });

  it('le conseil : l’expédition « L’or noir », la raffinerie, les puits, puis briqueterie, gare centrale, petite gare et la ligne', () => {
    const { w, sim, only, say, item } = village();
    only((l) => l === 'Raffinerie' || l === 'Puits de pétrole' || l.startsWith('chemin de fer'));
    expect(say()).toMatch(/« Raffinerie » .*, que débloque l’expédition « L’or noir »/);
    expect(sim.messageExp).toBe(true);
    w.exp.done.push('oil');
    expect(say()).toMatch(/^Pour l’âge suivant : il manque « Raffinerie » \(Bâtir › Production\) : elle tirera le carburant/);
    expect(sim.messageKind).toBe('refinery');
    w.place('refinery', ...spot(w, 'refinery', 100, 40), 0, true, 3, false);
    expect(say()).toMatch(/^Pour l’âge suivant : il manque 2 × « Puits de pétrole » .*gisement/);
    expect(sim.messageKind).toBe('oilwell');
    for (const [x, z] of oilSpot(w, 2)) w.place('oilwell', x, z, 0, true, 3, false);
    sim.recalc();
    expect(item('Puits de pétrole')).toMatchObject({ have: 2, need: 2 });
    // le chemin de fer, dans l'ordre des conseils du rail
    expect(say()).toMatch(/^Pour l’âge suivant, votre premier chemin de fer : bâtissez d’abord « Briqueterie »/);
    expect(sim.messageKind).toBe('brickworks');
    w.place('brickworks', ...spot(w, 'brickworks', 40, 100), 0, true, 3, false);
    expect(say()).toMatch(/bâtissez « Gare centrale »/);
    expect(sim.messageKind).toBe('terminal');
    const t = w.place('terminal', ...spot(w, 'terminal', 40, 40), 0, true, 3, false);
    expect(say()).toMatch(/il faut une autre gare à relier : « Petite gare »/);
    expect(sim.messageKind).toBe('station');
    const s = w.place('station', ...spot(w, 'station', 70, 70), 0, true, 3, false);
    expect(say()).toMatch(/^Pour l’âge suivant, votre premier chemin de fer : tracez une ligne de « Gare centrale » à une autre gare/);
    expect(sim.messageKind).toBeNull();
    expect(sim.messageRail).toBe(t.id);
    expect(sim.railNext()).toEqual({ stop: t.id });
    expect(item(RAIL_FIRST)).toMatchObject({ have: 0, need: 1 });
    w.lines.push({ id: 1, stops: [t.id, s.id], color: 0 });
    expect(item(RAIL_FIRST)).toMatchObject({ have: 1, need: 1 });
    expect(item(RAIL_LINKED)).toMatchObject({ have: 2, need: 2 });
    expect(say()).toMatch(/Tout est prêt pour l’âge suivant/);
    expect(sim.messageRail).toBeNull();
  });

  it('une ligne dont l’autre gare est démolie ne compte plus : le conseil revient à la gare, puis au tracé', () => {
    const { w, sim, only, say, item } = village();
    only((l) => l.startsWith('chemin de fer'));
    w.place('brickworks', ...spot(w, 'brickworks', 40, 100), 0, true, 3, false);
    const t = w.place('terminal', ...spot(w, 'terminal', 40, 40), 0, true, 3, false);
    const s = w.place('station', ...spot(w, 'station', 70, 70), 0, true, 3, false);
    w.lines.push({ id: 1, stops: [t.id, s.id], color: 0 });
    expect(item(RAIL_LINKED).have).toBe(2);
    w.removeBuilding(s.id);
    expect(item(RAIL_FIRST).have).toBe(0);
    expect(item(RAIL_LINKED).have).toBe(0);
    expect(say()).toMatch(/il faut une autre gare à relier : « Petite gare »/);
    w.place('station', ...spot(w, 'station', 70, 70), 0, true, 3, false);
    expect(say()).toMatch(/votre premier chemin de fer : tracez une ligne de « Gare centrale »/);
    expect(sim.messageRail).toBe(t.id);
  });

  it('un village qui a déjà sa raffinerie, ses puits et deux gares reliées passe, sauvegarde relue comprise', () => {
    const { w } = village();
    w.exp.done.push('oil', 'railway');
    w.place('refinery', ...spot(w, 'refinery', 100, 40), 0, true, 3, false);
    for (const [x, z] of oilSpot(w, 2)) w.place('oilwell', x, z, 0, true, 3, false);
    const t = w.place('terminal', ...spot(w, 'terminal', 40, 40), 0, true, 3, false);
    const s = w.place('station', ...spot(w, 'station', 70, 70), 0, true, 3, false);
    w.lines.push({ id: 1, stops: [t.id, s.id], color: 0, ok: true });
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    const sim = new Sim(r);
    sim.age = 3;
    sim.recalc();
    const items = sim.ageProgress()!.items;
    for (const l of ['Raffinerie', 'Puits de pétrole', RAIL_FIRST, RAIL_LINKED]) {
      const it = items.find((i) => i.label === l)!;
      expect(it.have, l).toBeGreaterThanOrEqual(it.need);
    }
    // une partie déjà à l'époque moderne n'a rien à refaire
    sim.age = 4;
    expect(sim.ageProgress()!.items.some((i) => i.label.startsWith('chemin de fer') || i.kind === 'refinery' || i.kind === 'oilwell')).toBe(false);
  });
});
