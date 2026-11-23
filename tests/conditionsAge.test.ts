import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim, ageGo, AgeItem, RAIL_FIRST, RAIL_LINKED, GOLD_LABEL } from '../src/sim/sim';
import { AGES, KINDS } from '../src/build/catalog';
import { MISSIONS, mandatoriesFor } from '../src/sim/missions';
import { DIFFICULTIES } from '../src/sim/difficulty';
import { CHOICE_LABEL } from '../src/sim/crossroads';
import { CONFLICT_LABEL } from '../src/sim/diplomacy';

/**
 * Le menu des conditions d'âge (en haut à gauche) : chaque ligne mène quelque part. Un bâtiment demandé doit se poser à l'âge
 * du village (ou dire quelle expédition de l'âge l'ouvre), une expédition doit exister et être de l'âge en cours. Retour de
 * joueur (22 nov. 2026) : « cliquer une condition ne donne parfois pas le bâtiment, ou n'ouvre pas l'expédition »
 */
describe('menu des conditions d’âge : chaque ligne a son geste', () => {
  beforeAll(() => setMapSize(96));

  /** Toutes les lignes de chaque passage, à chaque difficulté (Normal ne demande que l'excédent) */
  const all = () => {
    const out: { age: number; diff: string; item: AgeItem }[] = [];
    for (const diff of DIFFICULTIES) for (let age = 0; age < AGES.length - 1; age++) {
      const w = new World();
      w.difficulty = diff;
      w.heights.fill(1);
      const sim = new Sim(w);
      sim.age = age;
      sim.recalc();
      // (le bac à sable ne pose aucune condition)
      for (const item of sim.ageProgress()?.items ?? []) out.push({ age, diff, item });
    }
    return out;
  };

  it('un bâtiment demandé se pose à l’âge du village, ou son expédition est de l’âge (elle est alors dans la liste)', () => {
    for (const { age, diff, item } of all()) {
      const g = ageGo(item);
      if (!('kind' in g)) continue;
      const d = KINDS[g.kind], at = `${g.kind} (âge ${age}, ${diff})`;
      expect(d.minAge, at).toBeLessThanOrEqual(age);
      if (d.maxAge !== undefined) expect(d.maxAge, at).toBeGreaterThanOrEqual(age);
      if (d.reqMission) {
        const m = MISSIONS.find((x) => x.id === d.reqMission)!;
        expect(m.age, at).toBeLessThanOrEqual(age);
      }
    }
  });

  it('une expédition se retrouve par son identifiant (pas par son titre, qui change avec la langue)', () => {
    for (const { age, item } of all()) {
      if (!item.mission) continue;
      const g = ageGo(item);
      expect('mission' in g, item.label).toBe(true);
      const m = MISSIONS.find((x) => x.id === (g as { mission: string }).mission);
      expect(m, item.label).toBeDefined();
      expect(mandatoriesFor(age).map((x) => x.id)).toContain(m!.id);
    }
  });

  it('chaque sorte de ligne sans bâtiment a sa fiche', () => {
    const go = (label: string) => ageGo({ label, have: 0, need: 1 });
    expect(go('Habitants')).toEqual({ req: 'pop' });
    expect(go('minerai')).toEqual({ req: 'ore' });
    expect(go('briques (briqueterie)')).toEqual({ req: 'brick' });
    expect(go(GOLD_LABEL)).toEqual({ req: 'gold' });
    expect(go(CHOICE_LABEL)).toEqual({ req: 'choice' });
    expect(go(CONFLICT_LABEL)).toEqual({ req: 'conflict' });
    expect(go(RAIL_FIRST)).toEqual({ req: 'rail' });
    expect(go(RAIL_LINKED)).toEqual({ req: 'rail' });
    // aucune ligne réelle ne tombe par défaut sur les habitants, sauf la leur
    for (const { item } of all()) { const g = ageGo(item); if ('req' in g && g.req === 'pop') expect(item.label).toBe('Habitants'); }
  });
});
