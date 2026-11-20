import { describe, it, expect, afterEach } from 'vitest';
import { GOALS, GOALS_SHOWN, activeGoals, newGoalState, noteGoalEvent, progressOf, readGoalState, stepGoals, type GoalCtx } from '../src/sim/goals';
import { World } from '../src/world/world';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

const ctx = (o: Partial<GoalCtx> = {}): GoalCtx => ({
  age: 0, pop: 6, day: 0, season: 0, counts: {}, brick: 0, missions: [], security: 0,
  ok: { food: true, water: true, jobs: true, joy: true, health: true, housing: true }, ...o,
});

afterEach(() => setLang('fr', false));

describe('petits objectifs', () => {
  it('chaque âge en a au moins trois, les identifiants sont uniques', () => {
    for (let a = 0; a <= 5; a++) expect(GOALS.filter((g) => g.age === a).length).toBeGreaterThanOrEqual(GOALS_SHOWN);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
  });

  it('trois à la fois, ceux de l’âge du village, sans ceux qui attendent leur bâtiment', () => {
    const s = newGoalState();
    const act = activeGoals(s, ctx());
    expect(act.map((g) => g.id)).toEqual(['p-pop12', 'p-fed', 'p-exp']);
    expect(activeGoals(s, ctx({ age: 1 })).every((g) => g.age === 1)).toBe(true);
    // la taverne attend l'expédition du brasseur
    const med = (missions: string[]) => activeGoals({ ...newGoalState(), done: ['m-pop45', 'm-mine'] }, ctx({ age: 2, missions }));
    expect(med([]).map((g) => g.id)).not.toContain('m-tavern');
    expect(med(['brewer']).map((g) => g.id)).toContain('m-tavern');
  });

  it('un objectif atteint est rendu une fois et laisse sa place au suivant', () => {
    const s = newGoalState();
    expect(stepGoals(s, ctx({ pop: 11.9 }))).toEqual([]);
    const won = stepGoals(s, ctx({ pop: 12 }));
    expect(won.map((g) => g.id)).toEqual(['p-pop12']);
    expect(stepGoals(s, ctx({ pop: 12 }))).toEqual([]);
    expect(activeGoals(s, ctx()).map((g) => g.id)).toEqual(['p-fed', 'p-exp', 'p-winter']);
  });

  it('une série de jours se compte depuis son début et repart de zéro si elle casse', () => {
    const s = newGoalState(), fed = GOALS.find((g) => g.id === 'p-fed')!;
    stepGoals(s, ctx({ day: 4 }));
    expect(progressOf(fed, s, ctx({ day: 6 }))).toEqual([2, 3]);
    stepGoals(s, ctx({ day: 6, ok: { ...ctx().ok, food: false } }));
    stepGoals(s, ctx({ day: 7 }));
    expect(stepGoals(s, ctx({ day: 9 }))).toEqual([]);
    expect(stepGoals(s, ctx({ day: 10 })).map((g) => g.id)).toEqual(['p-fed']);
  });

  it('le premier hiver : atteint quand le printemps revient', () => {
    const s = { ...newGoalState(), done: ['p-pop12', 'p-fed'] };
    expect(stepGoals(s, ctx({ season: 2 }))).toEqual([]);
    expect(stepGoals(s, ctx({ season: 3 }))).toEqual([]);
    expect(stepGoals(s, ctx({ season: 0 })).map((g) => g.id)).toEqual(['p-winter']);
  });

  it('une expédition sans blessé : seulement celles réussies après l’arrivée de l’objectif', () => {
    const s = { ...newGoalState(), done: ['a-pop24'] };
    noteGoalEvent(s, 'safeExp');
    expect(stepGoals(s, ctx({ age: 1 }))).toEqual([]);
    noteGoalEvent(s, 'safeExp');
    expect(stepGoals(s, ctx({ age: 1 })).map((g) => g.id)).toEqual(['a-safe']);
  });

  it('une ancienne partie : ce qui est déjà rempli compte fait, sans récompense ni série en cours', () => {
    const s = readGoalState(undefined);
    expect(s.quiet).toBe(true);
    const won = stepGoals(s, ctx({ pop: 30, missions: ['herd'], counts: { lamp: 3 } }));
    expect(won).toEqual([]);
    expect(s.done).toEqual(expect.arrayContaining(['p-pop12', 'p-exp', 'p-lamp']));
    expect(s.done).not.toContain('p-fed');
    // ensuite, les objectifs se gagnent normalement
    expect(s.quiet).toBe(false);
  });

  it('se sauvegarde avec le monde et se relit ; un état abîmé ne casse rien', () => {
    const w = new World();
    w.goals.done.push('p-pop12');
    noteGoalEvent(w.goals, 'legend');
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const w2 = new World();
    w2.fromJSON(d);
    expect(w2.goals.done).toEqual(['p-pop12']);
    expect(w2.goals.events.legend).toBe(1);
    expect(w2.goals.quiet).toBeFalsy();
    const w3 = new World();
    w3.fromJSON({ ...d, goals: { done: ['inconnu', 3, 'p-exp'], streak: { 'p-fed': 'x' } } });
    expect(w3.goals.done).toEqual(['p-exp']);
    expect(w3.goals.streak).toEqual({});
    const { goals: _, ...old } = d;
    const w4 = new World();
    w4.fromJSON(old);
    expect(w4.goals.quiet).toBe(true);
  });

  it('chaque texte et chaque félicitation ont leur anglais', () => {
    setLang('en', false);
    for (const g of GOALS) {
      expect(tr(g.text), g.text).not.toBe(g.text);
      expect(tr(g.praise), g.praise).not.toBe(g.praise);
    }
  });
});
