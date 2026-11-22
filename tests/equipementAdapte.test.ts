import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/sim/missions';
import { GEAR, dangersOf, emptyStock, gearGaps, loadout } from '../src/sim/gear';

/**
 * L'équipement proposé colle au genre d'expédition : il pare les dangers du choix, et une expédition sans bêtes sauvages
 * (une course automobile, un vol en montgolfière, un forage…) ne demande pas d'armes. Un joueur se voyait proposer un fusil
 * pour la course automobile (notes de joueurs du 22 nov. 2026) : ses dangers étaient ceux de la plaine par défaut
 */
const WEAPONS = new Set(GEAR.filter((g) => g.guards === 'beast' || g.guards === 'monster' || g.also === 'beast').map((g) => g.id));
/** Les scènes sans bête à combattre : jeux, courses, machines, voyages en paix, l'espace */
const PEACEFUL = new Set(['race', 'balloon', 'rails', 'drill', 'crater', 'pugilat', 'games', 'launch', 'moon', 'colony', 'troupe', 'abbey']);

describe('équipement adapté à l’expédition', () => {
  it('à partir de l’âge industriel, plus de bêtes sauvages à parer', () => {
    for (const m of MISSIONS.filter((x) => x.age >= 3)) for (const c of m.choices) expect(dangersOf(c), `${m.id} › ${c.label}`).not.toContain('beast');
  });

  it('les expéditions sans bête à combattre ne proposent ni n’emportent d’arme', () => {
    const all = Object.fromEntries(GEAR.map((g) => [g.id, 6])) as ReturnType<typeof emptyStock>;
    const perks = ['obsidian'];
    for (const m of MISSIONS) for (const c of m.choices) {
      if (!PEACEFUL.has(c.scene)) continue;
      for (const age of [m.age, 5]) {
        const gaps = gearGaps(c, emptyStock(), [], age, () => true, perks).map((g) => g.gear.id);
        expect(gaps.filter((g) => WEAPONS.has(g)), `${m.id} › ${c.label} (âge ${age})`).toEqual([]);
      }
      const take = Object.keys(loadout(c, all).take).filter((g) => WEAPONS.has(g as never));
      expect(take, `${m.id} › ${c.label}`).toEqual([]);
    }
  });

  it('la course automobile ne craint que les intempéries', () => {
    for (const c of MISSIONS.find((m) => m.id === 'motorcar')!.choices) expect(dangersOf(c)).toEqual(['weather']);
  });

  it('une chasse demande encore des armes', () => {
    const c = MISSIONS.find((m) => m.id === 'wolf')!.choices[0];
    expect(gearGaps(c, emptyStock(), [], 2, () => true).some((g) => WEAPONS.has(g.gear.id))).toBe(true);
  });
});
