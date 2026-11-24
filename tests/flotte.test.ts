import { describe, it, expect } from 'vitest';
import {
  newFleet, readFleet, saveFleet, armWhy, armShip, stepFleet, fleetBack, fleetCap, shipClass, shipCost, afloat, nextReady,
  FLEET_MAX, PER_YARD, ARM_DAYS, REPAIR_DAYS, type FleetWorld,
} from '../src/sim/fleet';
import { ourShipModel, type ShipLook } from '../src/render/models/ourShips';

const DAY = 130;
/** Un village riche (ou pauvre), sans flotte */
function village(rich = true): FleetWorld {
  const n = rich ? 1000 : 0;
  return { fleet: newFleet(), wood: n, stone: n, ore: n, crude: n, fuel: n, brick: n, gold: n };
}

describe('la flotte de guerre (chantier B)', () => {
  it('le prix d’un navire : des ressources et de l’or, à chaque âge', () => {
    for (const age of [2, 3, 4, 5]) expect(shipCost(age).gold ?? 0).toBeGreaterThan(0);
    expect(shipCost(2)).toEqual({ wood: 60, ore: 20, gold: 15 });
    const w = village();
    expect(armShip(w, 2, 1, 0, DAY)).toBe(true);
    expect(w.wood).toBe(940); expect(w.ore).toBe(980); expect(w.gold).toBe(985); expect(w.stone).toBe(1000);
    // (ce qui manque se dit)
    const poor = village(false);
    expect(armWhy(poor, 2, 1)).toMatch(/Il manque/);
    expect(armShip(poor, 2, 1, 0, DAY)).toBe(false);
    expect(poor.fleet.arming.length).toBe(0);
    // (rien à payer en ressources illimitées)
    const free = { ...village(false), unlimited: true };
    expect(armShip(free, 3, 1, 0, DAY)).toBe(true);
    expect(free.gold).toBe(0);
  });

  it('un chantier naval, le Médiéval, et le plafond : deux par chantier, six au plus', () => {
    const w = village();
    expect(armWhy(w, 2, 0)).toMatch(/chantier naval/);
    expect(armWhy(w, 1, 1)).toMatch(/Médiéval/);
    expect(fleetCap(1)).toBe(PER_YARD);
    expect(fleetCap(5)).toBe(FLEET_MAX);
    expect(armShip(w, 2, 1, 0, DAY)).toBe(true);
    expect(armShip(w, 2, 1, 0, DAY)).toBe(true);
    // (les navires en chantier comptent)
    expect(armWhy(w, 2, 1)).toMatch(/Deux navires par chantier/);
    for (let i = 0; i < 4; i++) expect(armShip(w, 2, 3, 0, DAY)).toBe(true);
    expect(w.fleet.arming.length).toBe(FLEET_MAX);
    expect(armWhy(w, 2, 9)).toMatch(/au complet/);
  });

  it('le navire met une demi-journée à se faire, puis mouille au chantier', () => {
    const w = village();
    armShip(w, 2, 1, 100, DAY);
    expect(afloat(w.fleet)).toBe(0);
    expect(nextReady(w.fleet, 100)).toBeCloseTo(ARM_DAYS * DAY);
    expect(stepFleet(w.fleet, 100 + ARM_DAYS * DAY - 1, 1, DAY, 1)).toBe(0);
    expect(stepFleet(w.fleet, 100 + ARM_DAYS * DAY, 1, DAY, 1)).toBe(1);
    expect(w.fleet.hulls).toEqual([1]);
    expect(w.fleet.arming).toEqual([]);
  });

  it('un navire touché se répare au chantier (du temps, rien à payer) ; un navire coulé est perdu', () => {
    const w = village();
    w.fleet.hulls = [1, 1, 1];
    fleetBack(w.fleet, [0.4, 0, 1]);
    expect(w.fleet.hulls).toEqual([0.4, 1]);
    const gold = w.gold;
    // une coque entière se répare en REPAIR_DAYS jours ; sans chantier naval, rien ne se répare
    stepFleet(w.fleet, 0, REPAIR_DAYS * DAY * 0.3, DAY, 0);
    expect(w.fleet.hulls[0]).toBe(0.4);
    stepFleet(w.fleet, 0, REPAIR_DAYS * DAY * 0.3, DAY, 1);
    expect(w.fleet.hulls[0]).toBeCloseTo(0.7);
    stepFleet(w.fleet, 0, REPAIR_DAYS * DAY, DAY, 1);
    expect(w.fleet.hulls).toEqual([1, 1]);
    expect(w.gold).toBe(gold);
  });

  it('nos navires se modernisent d’eux-mêmes au passage d’âge (la classe se lit dans l’âge du village)', () => {
    expect(shipClass(2)).toBe('galleon');
    expect(shipClass(3)).toBe('ironclad');
    expect(shipClass(4)).toBe('destroyer');
    expect(shipClass(5)).toBe('destroyer');
    // (rien de la classe n'est sauvegardé : la même flotte relue est de l'âge du village)
    const f = { hulls: [1, 0.5], arming: [] };
    expect(saveFleet(f)).toEqual({ hulls: [1, 0.5], arming: [] });
  });

  it('les anciennes sauvegardes se chargent : sans flotte, une flotte vide ; des valeurs folles bornées', () => {
    expect(readFleet(undefined)).toEqual({ hulls: [], arming: [] });
    expect(readFleet(null)).toEqual({ hulls: [], arming: [] });
    expect(readFleet('n’importe quoi')).toEqual({ hulls: [], arming: [] });
    expect(readFleet({ hulls: [1, 2, -3, 'x', NaN, 0.5] })).toEqual({ hulls: [1, 1, 0.05, 0.5], arming: [] });
    expect(readFleet({ hulls: [1, 1, 1, 1, 1, 1, 1, 1], arming: [5] }).hulls.length).toBe(FLEET_MAX);
    expect(readFleet({ hulls: [1, 1, 1, 1, 1, 1], arming: [5] }).arming).toEqual([]);
    expect(saveFleet(newFleet())).toBeUndefined();
    // (aller-retour par le JSON de la sauvegarde)
    const f = { hulls: [0.75], arming: [321.4] };
    expect(readFleet(JSON.parse(JSON.stringify(saveFleet(f))))).toEqual({ hulls: [0.75], arming: [321] });
  });

  it('les modèles de nos navires et des pirates : propres et dans leur budget de triangles', () => {
    const tris = (g: { index: unknown; attributes: { position: { count: number } } } | null) => (g ? g.attributes.position.count / 3 : 0);
    // (une bataille en montre une douzaine : 3 500 triangles au plus pour les nôtres, 1 800 pour un pirate)
    const cap: Record<ShipLook, number> = { galleon: 3500, ironclad: 3500, destroyer: 3500, pirateCaravel: 1800, pirateDhow: 1800 };
    for (const k of Object.keys(cap) as ShipLook[]) {
      const m = ourShipModel(k), n = tris(m.body as never) + tris(m.glow as never);
      expect(n, k).toBeGreaterThan(400);
      expect(n, k).toBeLessThanOrEqual(cap[k]);
      expect(m.muzzles.length, k).toBeGreaterThan(0);
      // (proue vers +z, environ une case de long, posé sur l'eau)
      m.body.computeBoundingBox();
      const bb = m.body.boundingBox!;
      expect(bb.max.z - bb.min.z, k).toBeGreaterThan(0.7);
      expect(bb.max.z - bb.min.z, k).toBeLessThan(1.4);
      expect(bb.min.y, k).toBeLessThan(0);
      for (const v of m.body.attributes.position.array as Float32Array) expect(Number.isFinite(v)).toBe(true);
    }
    // les navires à vapeur fument
    expect(ourShipModel('ironclad').funnels.length).toBe(1);
    expect(ourShipModel('destroyer').funnels.length).toBe(2);
  });
});
