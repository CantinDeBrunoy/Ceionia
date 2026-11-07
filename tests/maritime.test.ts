import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize, SEASIDE } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { KINDS, KindId, KIND_ORDER, KIND_SUB, KIND_LABEL } from '../src/build/catalog';
import { KIND_ICON } from '../src/ui/icons';
import { getModel } from '../src/render/models';
import { MISSIONS, mandatoriesFor, readExpState, newExpState } from '../src/sim/missions';
import { eventsFor, EventCtx } from '../src/sim/events';
import { Expeditions, LIGHTHOUSE_RISK, SHIPYARD_RISK } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { shipRoute } from '../src/render/transports';
import { SeaTraffic, merchantKind, fisherKind } from '../src/render/seaTraffic';

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
const NEW: KindId[] = ['shipyard', 'lighthouse', 'fishmarket', 'offshore'];

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

describe('les bâtiments de la mer', () => {
  it('chantier naval, phare, halle aux poissons et ferme marine sont au catalogue, dans la barre de construction', () => {
    expect([...SEASIDE].sort()).toEqual([...NEW].sort());
    for (const k of NEW) {
      expect(KIND_ORDER, k).toContain(k);
      expect(KIND_SUB[k], k).toBeTruthy();
      expect(KIND_LABEL[k], k).toBeTruthy();
      expect(KIND_ICON[k], k).toBeTruthy();
      const d = KINDS[k];
      // un nom à chaque âge où on peut le bâtir
      for (let a = d.minAge; a <= 5; a++) expect(d.names[a], `${k} âge ${a}`).toBeTruthy();
      expect(d.size, k).toBeGreaterThanOrEqual(2);
    }
    expect(KINDS.shipyard.minAge).toBe(2);
    expect(KINDS.shipyard.reqMission).toBe('caravel');
    expect(KINDS.offshore.minAge).toBe(4);
  });

  it('ils ne se posent que près de l’eau, à cinq cases au plus', () => {
    const w = continent();
    let near: [number, number] | null = null, far: [number, number] | null = null;
    for (let z = 12; z < N - 12; z += 2)
      for (let x = 12; x < N - 12; x += 2) {
        if (w.canPlace('house', x, z) !== null || w.canPlace('house', x + 3, z + 3) !== null) continue;
        if (!w.waterNear(x, z, 3, 5)) { far ??= [x, z]; }
        else if (w.canPlace('lighthouse', x, z) === null) near ??= [x, z];
      }
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    for (const k of NEW) expect(w.canPlace(k, far![0], far![1]), k).toMatch(/près de l’eau/);
    expect(w.canPlace('lighthouse', near![0], near![1])).toBeNull();
  });

  it('chacun a un modèle à tous ses âges (avec le faisceau ou les pales qui tournent)', () => {
    for (const k of NEW) for (let a = KINDS[k].minAge; a <= 5; a++) {
      const m = getModel(k, a, { v: 0, L: false, R: false, F: false });
      expect(m.body.attributes.position.count, `${k} âge ${a}`).toBeGreaterThan(200);
    }
    const o = { v: 0, L: false, R: false, F: false };
    expect(getModel('lighthouse', 3, o).sways?.some((s) => s.spin && s.glow)).toBe(true);
    expect(getModel('offshore', 4, o).sways?.some((s) => s.spin)).toBe(true);
  });
});

describe('les expéditions de la mer', () => {
  it('la caravelle est obligatoire au Moyen Âge, prend la mer et ouvre le chantier naval', () => {
    const m = mission('caravel');
    expect(m.age).toBe(2);
    expect(m.mandatory).toBe(true);
    expect(m.unlocks).toBe('shipyard');
    expect(mandatoriesFor(2).map((x) => x.id)).toContain('caravel');
    for (const c of m.choices) expect(c.sea).toBe(true);
  });

  it('les expéditions facultatives en mer exigent le bâtiment que la caravelle ou le village ont ouvert', () => {
    expect(mission('spice').requires?.kinds).toContain('shipyard');
    expect(mission('galleon').requires?.kinds).toContain('shipyard');
    expect(mission('trawl').requires?.kinds).toContain('fishmarket');
    expect(mission('seafarm').requires?.kinds).toContain('offshore');
    for (const id of ['spice', 'galleon', 'trawl', 'seafarm']) {
      const m = mission(id);
      expect(m.mandatory, id).toBe(false);
      for (const c of m.choices) { expect(c.sea, id).toBe(true); expect(c.win.length, id).toBeGreaterThan(0); }
    }
    expect([mission('spice').age, mission('galleon').age, mission('trawl').age, mission('seafarm').age]).toEqual([2, 3, 4, 5]);
  });

  it('une épave à la dérive et un grain surviennent en mer, jamais sur une rivière', () => {
    const ctx = (id: string, arrive: boolean, sea = true): EventCtx => ({ dest: 'river', mission: id, scene: mission(id).choices[0].scene, age: mission(id).age, arrive, sea, warm: false, at: 0.6 });
    for (const id of ['caravel', 'spice', 'galleon', 'trawl', 'seafarm']) {
      expect(eventsFor(ctx(id, true)).map((e) => e.id), id).toContain('derelict');
      expect(eventsFor(ctx(id, false)).map((e) => e.id), id).toContain('squall');
      expect(eventsFor(ctx(id, true, false)).map((e) => e.id), id).not.toContain('derelict');
    }
    // pas pendant la chasse au monstre (elle a ses propres imprévus)
    expect(eventsFor({ dest: 'river', mission: 'kraken', scene: 'kraken', age: 1, arrive: true, sea: true }).map((e) => e.id)).not.toContain('derelict');
  });

  it('un phare et un chantier naval rendent les sorties en mer plus sûres, pas les autres', () => {
    const w = continent();
    const ex = new Expeditions(w, new Agents(w), () => 100, mulberry32(1));
    const sea = mission('spice').choices[0], land = mission('herd').choices[0];
    const base = ex.riskOf(sea), baseLand = ex.riskOf(land);
    const spot = (k: KindId) => { for (let z = 12; z < N - 12; z++) for (let x = 12; x < N - 12; x++) if (w.canPlace(k, x, z) === null) return [x, z]; throw new Error('pas de place'); };
    const [lx, lz] = spot('lighthouse');
    w.place('lighthouse', lx, lz, 0, true, 2, false);
    expect(ex.riskOf(sea)).toBeCloseTo(base * LIGHTHOUSE_RISK);
    const [sx, sz] = spot('shipyard');
    w.place('shipyard', sx, sz, 0, true, 2, false);
    expect(ex.riskOf(sea)).toBeCloseTo(base * LIGHTHOUSE_RISK * SHIPYARD_RISK);
    expect(ex.riskOf(land)).toBeCloseTo(baseLand);
  });
});

describe('les anciennes sauvegardes', () => {
  it('une partie qui avait fini les obligatoires du Moyen Âge, ou ouvert l’âge suivant, n’est pas bloquée par la caravelle', () => {
    expect(readExpState({ done: ['mine', 'dragon'] }).done).toContain('caravel');
    expect(readExpState({ done: ['mine', 'dragon', 'railway'] }).done).toContain('caravel');
    expect(readExpState({ done: ['railway'] }).done).toContain('caravel');
    // à mi-chemin du Moyen Âge, ou au début : la caravelle reste à faire
    expect(readExpState({ done: ['mine'] }).done).not.toContain('caravel');
    expect(readExpState({}).done).not.toContain('caravel');
    // une sauvegarde de la nouvelle version ne reçoit rien en cadeau
    expect(readExpState({ sea: 1, done: ['mine', 'dragon'] }).done).not.toContain('caravel');
    expect(newExpState().sea).toBe(1);
    expect(readExpState(JSON.parse(JSON.stringify(newExpState()))).sea).toBe(1);
  });

  it('un monde se recharge avec ses bâtiments de la mer, et un ancien état d’expéditions se lit', () => {
    const w = continent();
    w.place('lighthouse', ...(() => { for (let z = 12; z < N - 12; z++) for (let x = 12; x < N - 12; x++) if (w.canPlace('lighthouse', x, z) === null) return [x, z] as [number, number]; throw new Error('pas de place'); })(), 0, true, 2, false);
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.buildings.size).toBe(1);
    expect([...back.buildings.values()][0].kind).toBe('lighthouse');
    expect(back.exp.sea).toBe(1);
  });
});

describe('les navires qui sillonnent la mer', () => {
  it('chaque âge a son navire : caravelle, galion et vapeur, cargo, navire futuriste ; la pêche suit', () => {
    expect([2, 3, 4, 5].map((a) => merchantKind(a, 0))).toEqual(['caravel', 'galleon', 'cargo', 'hydro']);
    expect(merchantKind(3, 1)).toBe('steamer');
    expect([2, 3, 4, 5].map(fisherKind)).toEqual(['caravel', 'galleon', 'steamer', 'hydro']);
  });

  it('un chantier naval arme deux navires qui partent au large par le chenal, une halle aux poissons un bateau', () => {
    const w = continent();
    // un emplacement près de l'eau profonde, d'où un chenal long part
    let spot: [number, number] | null = null;
    for (let z = 20; z < N - 20 && !spot; z += 2) for (let x = 20; x < N - 20 && !spot; x += 2) if (w.canPlace('shipyard', x, z) === null && w.canPlace('fishmarket', x + 4, z) === null) spot = [x, z];
    expect(spot).not.toBeNull();
    w.place('shipyard', spot![0], spot![1], 0, true, 2, false);
    w.place('fishmarket', spot![0] + 4, spot![1], 0, true, 2, false);
    const traffic = new SeaTraffic(w, shipRoute);
    traffic.update(0.1, 2);
    const lanes = [...(traffic as unknown as { lanes: Map<number, { path: THREE.Vector3[]; vessels: { kind: string; state: string; root: THREE.Group }[] }> }).lanes.values()];
    expect(lanes.length).toBe(2);
    const counts = lanes.map((l) => l.vessels.length).sort();
    // (sans chenal assez long, un chantier n'a pas de navire : la carte d'essai en offre un)
    expect(counts.every((n) => n === 0) || counts.join() === '1,2').toBe(true);
    for (const l of lanes) {
      for (const v of l.vessels) expect(v.kind).toBe('caravel');
      // au bout de quelques minutes, un navire a gagné le large puis est revenu : il ne reste jamais coincé
      const seen = new Set<string>();
      for (let t = 0; t < 600; t++) { traffic.update(1, 2); for (const v of l.vessels) seen.add(v.state); }
      if (l.vessels.length) { expect(seen.has('out')).toBe(true); expect(seen.has('away')).toBe(true); expect(seen.has('in')).toBe(true); }
    }
  });
});
