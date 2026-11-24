import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim, modernStepsFor, reqKindsOf } from '../src/sim/sim';
import { AGES, KINDS, KIND_ORDER, KIND_LABEL, KindId } from '../src/build/catalog';
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

const STEPS: KindId[] = ['airport', 'racetrack', 'powerplant'];

describe('époque moderne : les étapes vers l’âge futuriste', () => {
  it('le circuit automobile et la centrale électrique sont des bâtiments de 3 × 3 de l’époque moderne, avec nom, icône et modèle', () => {
    for (const k of ['racetrack', 'powerplant'] as KindId[]) {
      const d = KINDS[k];
      expect(d.size).toBe(3);
      expect(d.minAge).toBe(4);
      expect(d.names[4]).not.toBe('');
      expect(d.names[5]).not.toBe('');
      expect(KIND_ORDER).toContain(k);
      expect(KIND_LABEL[k]).toBeTruthy();
      expect(KIND_ICON[k]).toBeTruthy();
      for (const age of [4, 5]) expect(getModel(k, age, { v: 0, L: false, R: false, F: false }).body.attributes.position.count).toBeGreaterThan(3000);
    }
  });

  it('l’âge futuriste demande, en fin d’âge, un aéroport, un circuit automobile et une centrale électrique', () => {
    expect(AGES[5].reqLate).toEqual({ airport: 1, racetrack: 1, powerplant: 1 });
    const w = continent();
    const sim = new Sim(w);
    sim.age = 4;
    const item = (k: KindId) => sim.ageProgress()!.items.find((i) => i.kind === k);
    for (const k of STEPS) expect(item(k)).toMatchObject({ have: 0, need: 1 });
    // elles viennent après les autres conditions, comme les bâtiments de fin d'âge
    const items = sim.ageProgress()!.items, at = items.findIndex((i) => i.kind === 'airport');
    expect(items.slice(at).map((i) => i.kind)).toEqual(STEPS);
    // bâties, elles sont remplies
    for (const k of STEPS) { const [x, z] = spot(w, k, 20, 20); w.place(k, x, z, 0, true, 4, false); }
    sim.recalc();
    for (const k of STEPS) expect(item(k)!.have).toBe(1);
    // en Normal aussi : aucun âge d'avant ne les demandait
    expect(reqKindsOf(5, 'normal', true)).toEqual({ airport: 1, racetrack: 1, powerplant: 1 });
  });

  it('une partie déjà à l’époque moderne avant leur arrivée n’est pas retenue : elle en est dispensée', () => {
    // une ancienne sauvegarde n'a pas le champ : tranché selon l'âge au chargement
    expect(modernStepsFor(null, 3)).toBe(true);
    expect(modernStepsFor(null, 4)).toBe(false);
    expect(modernStepsFor(null, 5)).toBe(false);
    // le champ sauvegardé l'emporte
    expect(modernStepsFor(true, 4)).toBe(true);
    expect(modernStepsFor(false, 2)).toBe(false);
    const w = continent();
    const sim = new Sim(w);
    sim.age = 4;
    w.modernSteps = false;
    expect(sim.ageProgress()!.items.some((i) => i.kind && STEPS.includes(i.kind))).toBe(false);
    // il se sauvegarde et se relit ; absent, il reste à trancher (null)
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.modernSteps).toBe(false);
    w.modernSteps = true;
    const again = new World();
    again.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(again.modernSteps).toBe(true);
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.modern;
    const legacy = new World();
    legacy.fromJSON(old);
    expect(legacy.modernSteps).toBeNull();
  });
});

describe('passer à l’époque moderne', () => {
  it('demande une briqueterie, disponible dès l’âge industriel (décision de l’auteur, 24 nov. 2026)', () => {
    expect(AGES[4].reqKinds.brickworks).toBe(1);
    expect(KINDS.brickworks.minAge).toBeLessThanOrEqual(3);
  });
});
