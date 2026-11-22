import { describe, it, expect } from 'vitest';
import { GameTime } from '../src/core/time';
import { readSeasonsOff, readCamSens } from '../src/save/save';
import { GOALS, GoalCtx, activeGoals, newGoalState } from '../src/sim/goals';

/** Fait tourner l'horloge `n` saisons, par petits pas, et note les saisons vues */
function run(t: GameTime, seasons: number) {
  const seen = new Set<number>();
  const step = t.seasonLen / 50;
  for (let i = 0; i < seasons * 50; i++) { t.update(step); seen.add(t.season); }
  return seen;
}

/**
 * Les saisons au choix (retour de joueur, 22 nov. 2026 : « un joueur qui n'aime que l'été ne joue qu'en été ») : l'horloge
 * saute les saisons éteintes, le décor va d'une saison allumée à la suivante, et une partie sans aucune saison ne casse pas
 */
describe('saisons éteintes par le joueur', () => {
  it('toutes allumées : l’année tourne comme avant', () => {
    const t = new GameTime();
    expect(run(t, 4)).toEqual(new Set([0, 1, 2, 3]));
  });

  it('l’été seul : il dure toujours, et le décor ne change jamais', () => {
    const t = new GameTime();
    t.setOff([0, 2, 3]);
    expect(t.season).toBe(1);
    const step = t.seasonLen / 40;
    for (let i = 0; i < 400; i++) {
      t.update(step);
      expect(t.season).toBe(1);
      const m = t.mix();
      // (une transition d'été à été : rien ne bouge)
      expect(m.a === 1 && m.b === 1).toBe(true);
    }
  });

  it('sans automne : de l’été à l’hiver, le décor passe directement de l’un à l’autre', () => {
    const t = new GameTime();
    t.setOff([2]);
    expect(run(t, 8)).toEqual(new Set([0, 1, 3]));
    // fin de l'été : la transition va vers l'hiver
    t.seasonT = 1.95;
    expect(t.mix()).toMatchObject({ a: 1, b: 3 });
    // le saut : l'automne n'a pas lieu, la transition finit depuis l'été
    t.update(t.seasonLen * 0.1);
    expect(t.season).toBe(3);
    const m = t.mix();
    expect(m.a).toBe(1);
    expect(m.b).toBe(3);
    expect(m.t).toBeGreaterThan(0);
  });

  it('aucune saison allumée : la partie ne se fige pas, toutes reviennent', () => {
    const t = new GameTime();
    t.setOff([0, 1, 2, 3]);
    expect(run(t, 4)).toEqual(new Set([0, 1, 2, 3]));
    for (let i = 0; i < 4; i++) expect(t.isOn(i)).toBe(true);
    expect(Number.isFinite(t.seasonT)).toBe(true);
  });

  it('éteindre la saison en cours la fait passer aussitôt', () => {
    const t = new GameTime();
    t.setSeason(0);
    t.setOff([0]);
    expect(t.season).toBe(1);
  });

  it('une ancienne sauvegarde (sans réglage) garde toutes les saisons et une sensibilité de 1', () => {
    expect(readSeasonsOff(undefined)).toEqual([]);
    expect(readSeasonsOff('été')).toEqual([]);
    expect(readSeasonsOff([1, 1, 7, -1, 2.5, 3])).toEqual([1, 3]);
    expect(readCamSens(undefined, 0.4, 2.5)).toBe(1);
    expect(readCamSens(Number.NaN, 0.4, 2.5)).toBe(1);
    expect(readCamSens(9, 0.4, 2.5)).toBe(2.5);
    expect(readCamSens(0.7, 0.4, 2.5)).toBe(0.7);
  });
});

describe('l’hiver éteint et les petits objectifs', () => {
  it('« Passer votre premier hiver » ne se propose pas sans hiver (il resterait bloqué)', () => {
    const s = newGoalState();
    s.done = GOALS.filter((g) => g.age === 0 && g.id !== 'p-winter').map((g) => g.id);
    const ctx: GoalCtx = { age: 0, pop: 0, day: 0, season: 1, counts: {}, brick: 0, missions: [], security: 0,
      ok: { food: false, water: false, jobs: false, joy: false, health: false, housing: false } };
    expect(activeGoals(s, ctx).map((g) => g.id)).toEqual(['p-winter']);
    expect(activeGoals(s, { ...ctx, noWinter: true })).toEqual([]);
  });
});
