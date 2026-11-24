import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { mulberry32 } from '../src/core/rng';
import {
  SHOWS, showOf, showFor, showBlock, showStarted, showReward, showJoy, showJoyFor, showRoom, showWait, waitLabel,
  readShowState, newShowState, showStateEmpty, planMatch, matchK, MATCH_TIME,
} from '../src/sim/shows';
import { MatchView } from '../src/render/shows/football';
import { footSpots, teamColors } from '../src/render/shows/common';
import { DEFAULT_BLASON } from '../src/sim/blason';

const DAY = 130;
const ctx = { running: false, raining: false, away: false };

describe('les gestes des bâtiments : règles', () => {
  beforeAll(() => setMapSize(96));

  it('le stade de football a son geste dès l’âge industriel', () => {
    const d = showOf('football')!;
    expect(d.id).toBe('match');
    expect(showFor({ id: 1, kind: 'football', x: 0, z: 0, rot: 0, auto: true, age: 3 })).toBe(d);
    expect(showOf('house')).toBeUndefined();
  });

  it('une fois lancé, le geste attend son délai ; un spectacle à la fois ; pas de sport sous l’averse', () => {
    const s = newShowState(), d = showOf('football')!;
    expect(showBlock(s, d, 0, DAY, ctx)).toBeNull();
    showStarted(s, d, 10, DAY);
    expect(showWait(s, 'match', 10)).toBe(d.cooldown * DAY);
    expect(showBlock(s, d, 10 + DAY / 2, DAY, ctx)).toContain('12 h');
    expect(showBlock(s, d, 10 + DAY, DAY, ctx)).toBeNull();
    expect(showBlock(s, d, 10 + DAY, DAY, { ...ctx, running: true })).toContain('Un autre spectacle');
    expect(showBlock(s, d, 10 + DAY, DAY, { ...ctx, raining: true })).toContain('pleut');
    expect(showBlock(s, d, 10 + DAY, DAY, { ...ctx, away: true })).toContain('Revenez');
  });

  it('le temps d’attente se dit en heures, puis en jours', () => {
    expect(waitLabel(DAY / 24, DAY)).toBe('1 h');
    expect(waitLabel(DAY, DAY)).toBe('1 jour');
    expect(waitLabel(DAY * 2.5, DAY)).toBe('2 j 12 h');
    expect(waitLabel(DAY * 3, DAY)).toBe('3 jours');
  });

  it('le bien-être d’un geste dure son temps et ne s’additionne pas : le refaire le remplace', () => {
    const s = newShowState(), d = showOf('football')!;
    showReward(s, d, 9, 0, DAY);
    expect(showJoy(s, 1)).toBe(9);
    showReward(s, d, 6, 50, DAY);
    expect(showJoy(s, 60)).toBe(6);
    expect(s.boost.length).toBe(1);
    expect(showJoy(s, 50 + d.joyDays * DAY + 1)).toBe(0);
  });

  it('bien-être d’un match : la part du stade à son âge, plus si le village gagne', () => {
    const d = showOf('football')!, b = { kind: 'football' as const, age: 4 };
    expect(showJoyFor(d, b)).toBe(8);
    expect(showJoyFor(d, b, matchK([2, 1]))).toBe(12);
    expect(showJoyFor(d, b, matchK([1, 1]))).toBe(8);
    expect(showJoyFor(d, b, matchK([0, 3]))).toBe(5);
  });

  it('de nouveaux habitants seulement s’il reste de la place, et toujours une place libre', () => {
    expect(showRoom(2, 50, 60)).toBe(2);
    expect(showRoom(2, 58, 60)).toBe(1);
    expect(showRoom(2, 59, 60)).toBe(0);
    expect(showRoom(2, 60, 60)).toBe(0);
  });

  it('sauvegarde : une ancienne partie n’a rien, un état abîmé se relit sans casser, un état valable revient tel quel', () => {
    expect(readShowState(undefined)).toEqual(newShowState());
    expect(readShowState({ next: { match: 'x', autre: 4 }, boost: [null, { id: 'match', n: 3 }] })).toEqual(newShowState());
    const s = { next: { match: 300 }, boost: [{ id: 'match' as const, n: 9, until: 400 }] };
    expect(readShowState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(showStateEmpty(newShowState())).toBe(true);
    expect(showStateEmpty(s)).toBe(false);
  });

  it('le monde garde les délais et le bien-être en cours d’une sauvegarde à l’autre', () => {
    const w = new World();
    w.shows.next.match = 500;
    w.shows.boost.push({ id: 'match', n: 7, until: 900 });
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.shows.next.match).toBe(500);
    expect(w2.shows.boost).toEqual([{ id: 'match', n: 7, until: 900 }]);
    // une partie sans geste n'écrit rien de plus
    expect('shows' in (new World().toJSON() as object)).toBe(false);
  });

  it('le bien-être d’un geste compte dans la jauge et dans sa fiche', () => {
    const w = new World();
    w.heights.fill(1);
    const sim = new Sim(w);
    sim.update(0, 1);
    const before = sim.joy.cap;
    w.shows.boost.push({ id: 'match', n: 9, until: w.exp.clock + 100 });
    sim.update(0, 1);
    expect(sim.joy.cap).toBeCloseTo(before + 9);
    expect(sim.needDetail('joy').rows.some((r) => r.label === 'Fêtes et spectacles (en cours)' && r.v === 9)).toBe(true);
  });

  it('chaque geste a son texte, son délai et sa récompense', () => {
    for (const d of SHOWS) {
      expect(d.act.length).toBeGreaterThan(5);
      expect(d.tip).not.toContain(';');
      expect(d.cooldown).toBeGreaterThan(0);
      expect(d.joyK * d.joyDays).toBeGreaterThan(0);
    }
  });
});

describe('le match', () => {
  it('le déroulé tiré d’avance : de 0 à 5 buts, espacés, dans le temps de jeu, et le score qui va avec', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 400; seed++) {
      const p = planMatch(mulberry32(seed));
      seen.add(p.goals.length);
      expect(p.goals.length).toBeLessThanOrEqual(5);
      expect(p.score[0] + p.score[1]).toBe(p.goals.length);
      p.goals.forEach((g, i) => {
        expect(g.t).toBeGreaterThanOrEqual(6);
        expect(g.t).toBeLessThanOrEqual(MATCH_TIME - 6);
        if (i) expect(g.t - p.goals[i - 1].t).toBeGreaterThanOrEqual(6);
      });
    }
    // des 0 à 0 comme des cartons
    expect(seen.has(0) && seen.has(3)).toBe(true);
  });

  it('les visiteurs ne portent jamais les couleurs du village', () => {
    const c = teamColors(DEFAULT_BLASON);
    expect(c.away).not.toBe(c.home);
    expect(c.away).not.toBe(c.homeB);
  });

  it('joué jusqu’au bout, le match marque les buts prévus, aux deux mi-temps, et se termine', () => {
    for (const seed of [3, 11, 42, 77]) {
      const plan = planMatch(mulberry32(seed));
      const goals: number[] = [];
      let whistles = 0;
      const v = new MatchView(plan, { age: 4, seed, scale: 1, home: 0x2f5fa8, homeB: 0xe2b443, away: 0xf4f2ee, awayB: 0xe8322a, spots: footSpots(4) }, {
        goal: (side) => goals.push(side),
        whistle: (long) => { if (long) whistles++; },
      });
      let t = 0;
      while (!v.done && t < 200) { v.update(1 / 30); t += 1 / 30; }
      expect(v.done).toBe(true);
      expect(v.score).toEqual(plan.score);
      expect(goals).toEqual(plan.goals.map((g) => g.side));
      // coup d'envoi, mi-temps, reprise, fin
      expect(whistles).toBe(4);
      v.dispose();
    }
  });
});
