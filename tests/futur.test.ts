import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { AGES, KINDS, KIND_ORDER, KIND_LABEL, KindId } from '../src/build/catalog';
import { MISSIONS, mandatoryFor, VICTORY } from '../src/sim/missions';
import { Expeditions, Report } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { getModel } from '../src/render/models';
import { KIND_ICON } from '../src/ui/icons';

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

/** Un petit quartier futuriste : quelques tours d'habitation autour d'une place, et le cosmodrome à côté */
function spaceTown(w: World) {
  const [x, z] = spot(w, 'spaceport', 40, 40);
  w.place('spaceport', x, z, 0, true, 5, false);
  w.place('gather', ...spot(w, 'gather', x, z + 5), 0, true, 5, false);
  for (let i = 0; i < 6; i++) w.place('house', ...spot(w, 'house', x, z + 5), 0, true, 5, false);
  for (const k of ['vfarm', 'well'] as KindId[]) w.place(k, ...spot(w, k, x, z + 5), 0, true, 5, false);
  return [x, z];
}

describe('âge futuriste', () => {
  it('six âges ; chaque bâtiment a son nom et ses valeurs à chacun', () => {
    expect(AGES.length).toBe(6);
    expect(AGES[5].name).toBe('Futuriste');
    for (const id of Object.keys(KINDS) as KindId[]) {
      const d = KINDS[id];
      expect(d.names.length).toBe(AGES.length);
      expect(d.names[5]).not.toBe('');
      for (const f of ['housing', 'food', 'water', 'jobs', 'joy', 'health'] as const) if (d[f]) expect(d[f]!.length).toBe(AGES.length);
      expect(KIND_LABEL[id]).toBeTruthy();
      expect(KIND_ICON[id]).toBeTruthy();
    }
    expect(KINDS.house.names[5]).toBe('Tour d’habitation');
    for (const id of ['arcology', 'vfarm', 'fusion', 'spaceport', 'research', 'maglev'] as KindId[]) { expect(KINDS[id].minAge).toBe(5); expect(KIND_ORDER).toContain(id); }
  });

  it('on y passe comme aux autres âges : population, bâtiments, minerai et l’expédition obligatoire de l’époque moderne', () => {
    const w = continent(), sim = new Sim(w);
    sim.age = 4;
    const ap = sim.ageProgress()!;
    expect(ap.next).toBe(5);
    expect(ap.items.find((i) => i.label === 'Habitants')!.need).toBe(AGES[5].reqPop);
    expect(ap.items.some((i) => i.label.startsWith('minerai'))).toBe(true);
    const m = ap.items.find((i) => i.label.startsWith('expédition'))!;
    expect(m.label).toContain(mandatoryFor(4)!.title);
    expect(sim.ready).toBe(false);
    // tout est réuni : on passe à l'âge futuriste, le dernier
    sim.ageProgress = () => ({ next: 5, ratio: 1, items: [{ label: 'Habitants', have: 180, need: 180 }] });
    expect(sim.advance()).toBe(true);
    expect(sim.age).toBe(5);
    delete (sim as Partial<Sim>).ageProgress;
    expect(sim.ageProgress()).toBeNull();
    expect(sim.nameOf('house')).toBe('Tour d’habitation');
  });

  it('une partie futuriste se sauvegarde et se relit, ses bâtiments à l’âge 5', () => {
    const w = continent();
    spaceTown(w);
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    const ages = [...r.buildings.values()].map((b) => [b.kind, b.age]);
    expect(ages).toEqual([...w.buildings.values()].map((b) => [b.kind, b.age]));
    expect(ages.every(([, a]) => a === 5)).toBe(true);
    const sim = new Sim(r);
    sim.age = 5;
    sim.recalc();
    // six tours d'habitation à 20 places
    expect(sim.housing.cap).toBe(6 * KINDS.house.housing![5]);
  });

  it('une ancienne partie de l’époque moderne se relit telle quelle, l’âge futuriste devant elle', () => {
    const w = continent();
    for (let i = 0; i < 4; i++) w.place('house', ...spot(w, 'house', 60, 60), 0, true, 4, false);
    w.exp.done.push('herd', 'summit');
    // une sauvegarde d'avant l'âge futuriste : rien de ce qu'il apporte
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    const r = new World();
    r.fromJSON(old);
    expect([...r.buildings.values()].every((b) => b.age === 4)).toBe(true);
    expect(r.exp.done).toEqual(['herd', 'summit']);
    const sim = new Sim(r);
    sim.age = 4;
    sim.recalc();
    expect(sim.housing.cap).toBe(4 * KINDS.house.housing![4]);
    expect(sim.ageProgress()!.next).toBe(5);
    // l'expédition obligatoire de l'époque moderne y est déjà comptée
    expect(sim.ageProgress()!.items.find((i) => i.label.startsWith('expédition'))!.have).toBe(1);
  });

  it('chaque bâtiment a son modèle à l’âge futuriste', () => {
    for (const id of Object.keys(KINDS) as KindId[]) for (let v = 0; v < 3; v++) {
      const m = getModel(id, 5, { v, L: v === 1, R: v === 2, F: v !== 0 });
      const pos = m.body.attributes.position;
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i += 97) expect(Number.isFinite(pos.getY(i))).toBe(true);
    }
    // les tours d'habitation sont bien plus hautes que les résidences de l'époque moderne
    const top = (age: number) => { const g = getModel('house', age, { v: 4, L: false, R: false, F: true }).body; g.computeBoundingBox(); return g.boundingBox!.max.y; };
    expect(top(5)).toBeGreaterThan(top(4) * 1.5);
  });
});

describe('la conquête de l’espace', () => {
  const ids = ['rocket', 'moon', 'colony'];

  it('trois expéditions qui s’ouvrent l’une après l’autre, au cosmodrome', () => {
    const space = ids.map((id) => MISSIONS.find((m) => m.id === id)!);
    expect(space.every((m) => m && m.age === 5 && m.requires?.kinds?.includes('spaceport'))).toBe(true);
    expect(space[1].requires!.missions).toEqual(['rocket']);
    expect(space[2].requires!.missions).toEqual(['moon']);
    expect(space[2].requires!.kinds).toContain('fusion');
    expect(space[2].id).toBe(VICTORY);
    for (const m of space) for (const c of m.choices) expect(c.dest).toBe('spaceport');
    const w = continent(), agents = new Agents(w), ex = new Expeditions(w, agents, () => 100, () => 0.99);
    expect(ex.missing(space[0])).toEqual(['bâtir : cosmodrome']);
    expect(ex.missing(space[1])).toEqual(['réussir « Premier vol de fusée »', 'bâtir : cosmodrome']);
    spaceTown(w);
    expect(ex.missing(space[0])).toEqual([]);
    w.exp.done.push('rocket');
    expect(ex.missing(space[1])).toEqual([]);
    w.exp.done.push('moon');
    expect(ex.missing(space[2])).toEqual(['bâtir : centrale à fusion']);
    // à l'âge futuriste, la liste des expéditions les montre ; pas avant
    expect(ex.list(4).some((m) => ids.includes(m.id))).toBe(false);
    expect(ex.list(5).filter((m) => ids.includes(m.id)).length).toBe(3);
  });

  it('le premier vol part du pied du cosmodrome et revient ; la colonie fondée, la partie est gagnée', () => {
    const w = continent(), [px, pz] = spaceTown(w), agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 5, false, 30, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99), rocket = MISSIONS.find((m) => m.id === 'rocket')!;
    const a = ex.start(rocket, 0, 5)!;
    expect(a).not.toBeNull();
    // l'équipe se rend au bord du cosmodrome (4 × 4), pas dans la campagne
    expect(Math.hypot(a.dest[0] - (px + 2), a.dest[1] - (pz + 2))).toBeLessThan(4.5);
    let report: Report | null = null;
    ex.onReport = (r) => (report = r);
    for (let i = 0; i < 40000 && !report; i++) {
      agents.update(0.05, 10, 5, false, 30, 0); ex.update(0.05);
      if (a.wait) ex.decide(a, 0);
    }
    expect(report!.ok).toBe(true);
    expect(w.exp.done).toContain('rocket');
    // la fin : la colonie fondée, le conseil du village le dit
    const sim = new Sim(w);
    sim.age = 5;
    w.exp.done.push('moon', VICTORY);
    sim.recalc(); sim.update(0, 1);
    expect(sim.message).toContain('étoiles');
  });
});
