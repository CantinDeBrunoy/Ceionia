import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { mulberry32 } from '../src/core/rng';
import {
  SHOWS, showOf, showFor, showBlock, showStarted, showReward, showJoy, showJoyFor, showRoom, showWait, waitLabel,
  readShowState, newShowState, showStateEmpty, planMatch, matchK, MATCH_TIME, planRace, raceRecord, planTourney, showGold, showNeed,
} from '../src/sim/shows';
import { RaceView } from '../src/render/shows/race';
import { FireworksView } from '../src/render/shows/fireworks';
import { FeastView } from '../src/render/shows/feast';
import { RiteView } from '../src/render/shows/rite';
import { PlayView } from '../src/render/shows/play';
import { TourneyView, arenaSpots } from '../src/render/shows/tourney';
import { arenaBout } from '../src/render/arena';
import { getModel } from '../src/render/models';
import { MatchView } from '../src/render/shows/football';
import { footSpots, trackSpots, teamColors } from '../src/render/shows/common';
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

describe('la course', () => {
  it('le stade d’athlétisme a son geste, la course', () => {
    expect(showOf('stadium')!.id).toBe('race');
  });

  it('six temps de 44 à 52 s, au centième', () => {
    for (let seed = 1; seed < 100; seed++) {
      const t = planRace(mulberry32(seed));
      expect(t.length).toBe(6);
      for (const x of t) { expect(x).toBeGreaterThanOrEqual(44); expect(x).toBeLessThanOrEqual(52); expect(Math.round(x * 100)).toBeCloseTo(x * 100, 6); }
    }
  });

  it('un record tombe à la première course, puis seulement s’il est battu ; il se sauvegarde', () => {
    const s = newShowState();
    expect(raceRecord(s, 47)).toBe(true);
    s.record = 46.5;
    expect(raceRecord(s, 47)).toBe(false);
    expect(raceRecord(s, 46.2)).toBe(true);
    expect(readShowState(JSON.parse(JSON.stringify(s))).record).toBe(46.5);
  });

  it('courue jusqu’au bout, chacun passe la ligne dans l’ordre de son temps, puis le podium, et la course se termine', () => {
    for (const big of [true, false]) for (const seed of [5, 23]) {
      const times = planRace(mulberry32(seed));
      let guns = 0;
      const v = new RaceView(times, big, { age: 4, seed, scale: 1, home: 0, homeB: 0, away: 0, awayB: 0, spots: trackSpots(big) }, { gun: () => guns++ });
      const order: number[] = [];
      let t = 0, podium = false;
      while (!v.done && t < 120) {
        const before = (v as any).finished;
        v.update(1 / 30); t += 1 / 30;
        if ((v as any).finished > before) for (const r of (v as any).runners) if (r.done && !order.includes(r.lane)) order.push(r.lane);
        if (v.phase === 'podium') podium = true;
      }
      expect(v.done).toBe(true);
      expect(guns).toBe(1);
      expect(podium).toBe(true);
      expect(order.length).toBe(6);
      // dans l'ordre des temps (deux coureurs à moins d'une image l'un de l'autre passent la ligne ensemble)
      for (let i = 1; i < order.length; i++) expect(times[order[i]] - times[order[i - 1]]).toBeGreaterThan(-0.1);
      expect(v.winner().t).toBeCloseTo(Math.min(...times), 5);
      v.dispose();
    }
  });
});

describe('le feu d’artifice', () => {
  it('la fête foraine a son geste, regardé de dehors, sous la pluie aussi, avec trois jours de délai', () => {
    const d = showOf('funfair')!;
    expect(d.id).toBe('fireworks');
    expect(d.watch).toBeTruthy();
    expect(d.sky).toBe(true);
    expect(d.dry).toBe(false);
    expect(showBlock(newShowState(), d, 0, DAY, { ...ctx, raining: true })).toBeNull();
    expect(d.cooldown).toBe(3);
    expect(showJoyFor(d, { kind: 'funfair', age: 4 })).toBe(13);
  });

  it('tiré jusqu’au bout : chaque fusée part et éclate, le bouquet final, puis la fin ; jamais plus d’étincelles que prévu', () => {
    for (const age of [3, 4, 5]) {
      let bangs = 0, whistles = 0, most = 0;
      const v = new FireworksView({ age, seed: 9 + age, scale: 1, home: 0, homeB: 0, away: 0, awayB: 0, spots: [] }, { bang: () => bangs++, whistle: () => whistles++ });
      let t = 0, finale = false;
      while (!v.done && t < 120) {
        v.update(1 / 30); t += 1 / 30;
        if (v.phase === 'finale') finale = true;
        most = Math.max(most, (v as any).sparks.length);
      }
      expect(v.done).toBe(true);
      expect(finale).toBe(true);
      expect(bangs).toBe(v.count);
      expect(whistles).toBeGreaterThan(v.count / 3);
      expect(v.count).toBeGreaterThan(30);
      expect(most).toBeLessThanOrEqual(5000);
      // à la fin, plus une étincelle en l'air
      expect((v as any).sparks.length).toBe(0);
      v.dispose();
    }
  });
});

describe('les gestes des premiers âges', () => {
  beforeAll(() => setMapSize(96));
  const kit = (age: number, seed = 7) => ({ age, seed, scale: 1, home: 0x2f5fa8, homeB: 0xe2b443, away: 0xf4f2ee, awayB: 0xe8322a, spots: [] });
  const run = (v: { done: boolean; update(dt: number): void }, max = 200, each?: (t: number) => void) => {
    let t = 0;
    while (!v.done && t < max) { v.update(1 / 30); t += 1 / 30; each?.(t); }
    return t;
  };

  it('la place du village a son geste dès la Préhistoire ; le temple, le théâtre et l’arène dès qu’ils existent', () => {
    const at = (kind: 'gather' | 'temple' | 'theater' | 'arena', age: number) => showFor({ id: 1, kind, x: 0, z: 0, rot: 0, auto: true, age });
    expect(at('gather', 0)!.id).toBe('feast');
    expect(at('temple', 1)!.id).toBe('rite');
    expect(at('theater', 1)!.id).toBe('play');
    expect(at('arena', 1)!.id).toBe('tourney');
    // délais : trois jours la fête, deux le temple, un le théâtre, un et demi le tournoi
    expect([showOf('gather')!.cooldown, showOf('temple')!.cooldown, showOf('theater')!.cooldown, showOf('arena')!.cooldown]).toEqual([3, 2, 1, 1.5]);
    // aucun ne craint la pluie (le feu de la place, le temple, une salle, l'arène)
    for (const k of ['gather', 'temple', 'theater', 'arena'] as const) expect(showBlock(newShowState(), showOf(k)!, 0, DAY, { ...ctx, raining: true })).toBeNull();
  });

  it('le temple soigne : ses soins comptent dans la jauge des soins et sa fiche, pas dans le bien-être', () => {
    const d = showOf('temple')!;
    expect(showNeed('rite')).toBe('health');
    expect(showNeed('match')).toBe('joy');
    // la part du bien-être du temple à son âge : 14 × 0,3 à l'Antiquité, 20 × 0,3 au Moyen Âge
    expect(showJoyFor(d, { kind: 'temple', age: 1 })).toBe(4);
    expect(showJoyFor(d, { kind: 'temple', age: 2 })).toBe(6);
    const w = new World();
    w.heights.fill(1);
    const sim = new Sim(w);
    sim.update(0, 1);
    const joy = sim.joy.cap, health = sim.health.cap;
    showReward(w.shows, d, 5, w.exp.clock, DAY);
    sim.update(0, 1);
    expect(sim.health.cap).toBeCloseTo(health + 5);
    expect(sim.joy.cap).toBeCloseTo(joy);
    expect(showJoy(w.shows, w.exp.clock, 'health')).toBe(5);
    expect(showJoy(w.shows, w.exp.clock)).toBe(0);
    expect(sim.needDetail('health').rows.some((r) => r.label === 'Fête au temple (en cours)' && r.v === 5)).toBe(true);
    // il dure un jour et demi
    expect(showJoy(w.shows, w.exp.clock + 1.5 * DAY + 1, 'health')).toBe(0);
  });

  it('sauvegarde : les nouveaux gestes se relisent, une ancienne partie n’a rien en cours', () => {
    const s = { next: { feast: 300, rite: 200, play: 100, tourney: 50 }, boost: [{ id: 'rite' as const, n: 4, until: 400 }, { id: 'tourney' as const, n: 9, until: 500 }] };
    expect(readShowState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const w = new World();
    w.shows.next.feast = 700;
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.shows.next.feast).toBe(700);
  });

  it('l’or de la recette : le match, et la représentation à l’opéra seulement', () => {
    expect(showGold('match', 3, 12)).toBe(6);
    expect(showGold('play', 1, 10)).toBe(0);
    expect(showGold('play', 3, 10)).toBe(3);
    expect(showGold('tourney', 2, 12)).toBe(0);
  });

  it('un tournoi se joue en deux ou trois manches, et le vainqueur en a gagné deux', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 300; seed++) {
      const p = planTourney(mulberry32(seed));
      seen.add(p.rounds.length);
      expect(p.rounds.filter((x) => x === p.winner).length).toBe(2);
      expect(p.rounds.filter((x) => x !== p.winner).length).toBeLessThanOrEqual(1);
      expect(p.rounds[p.rounds.length - 1]).toBe(p.winner);
    }
    expect([...seen].sort()).toEqual([2, 3]);
  });

  it('la fête du village : elle attend le village, allume la fête de la place une fois, et se termine', () => {
    for (const age of [0, 1, 3]) {
      let starts = 0;
      const v = new FeastView(age, { start: () => starts++ });
      v.update(1);
      expect(v.phase).toBe('gather');
      v.ready();
      const t = run(v);
      expect(v.done).toBe(true);
      expect(starts).toBe(1);
      expect(t).toBeLessThan(45);
      expect(v.board()).toContain('Fête du village');
    }
  });

  it('la fête au temple : chaque fidèle dépose une offrande, les chants, la bénédiction aux trois coups de cloche', () => {
    for (const age of [1, 2, 4]) {
      let chants = 0, bells = 0;
      const v = new RiteView(age, 5 + age, { chant: () => chants++, bell: () => bells++ });
      for (let i = 0; i < 8; i++) v.arrived(i);
      expect(v.offered).toBe(8);
      v.ready();
      const phases = new Set<string>();
      run(v, 200, () => phases.add(v.phase));
      expect(v.done).toBe(true);
      expect([...phases]).toEqual(['gather', 'chant', 'bless', 'end']);
      expect(chants).toBeGreaterThanOrEqual(4);
      // une à l'ouverture des chants, trois à la bénédiction
      expect(bells).toBe(4);
      v.dispose();
    }
  });

  it('la représentation : la file, l’entrée, deux actes, le salut sous les fleurs ; les spectateurs suivent', () => {
    for (const age of [1, 2, 3, 5]) {
      let bells = 0;
      const v = new PlayView(age, 3 + age, { bell: () => bells++ });
      const crowd: string[] = [v.crowd];
      v.ready();
      run(v, 200, () => { if (crowd[crowd.length - 1] !== v.crowd) crowd.push(v.crowd); });
      expect(v.done).toBe(true);
      expect(crowd).toEqual(['wait', 'in', 'show', 'out']);
      expect(bells).toBe(1);
      expect((v as any).thrown).toBeGreaterThan(10);
      // les fleurs arrivées sont au sol, devant l'entrée
      for (const f of (v as any).flowers) if (f.t >= f.dur) expect(f.m.position.y).toBeLessThan(0.05);
      expect(v.title.length).toBeGreaterThan(5);
      v.dispose();
    }
  });

  it('le tournoi : le combat de chaque âge, les manches prévues, le vainqueur couronné', () => {
    expect([1, 2, 3, 4, 5].map((a) => arenaBout(a).kind)).toEqual(['fist', 'joust', 'fist', 'fist', 'robot']);
    for (const age of [1, 2, 3, 4, 5]) for (const seed of [4, 9]) {
      const plan = planTourney(mulberry32(seed));
      let hits = 0, bells = 0;
      const v = new TourneyView(age, plan.rounds, kit(age, seed), { hit: () => hits++, bell: () => bells++ });
      // chaque champion a des pièces qui bougent (bras, masse, scie), sauf le chevalier (lance et cheval d'une pièce)
      if (age !== 2) for (const c of v.champs) expect(c.pieces.length).toBeGreaterThan(0);
      const t = run(v, 200);
      expect(v.done).toBe(true);
      expect(t).toBeLessThan(60);
      expect(v.champs[plan.winner].wins).toBe(2);
      expect(v.champs[1 - plan.winner].wins).toBe(plan.rounds.length - 2);
      expect(v.winner()).toBe(v.champs[plan.winner].name);
      expect(v.champs[0].name).not.toBe(v.champs[1].name);
      // un coup au moins par manche, la cloche à chaque manche et au couronnement
      expect(hits).toBeGreaterThanOrEqual(plan.rounds.length);
      expect(bells).toBe(plan.rounds.length + 1);
      expect(arenaSpots(age).length).toBeGreaterThan(50);
      v.dispose();
    }
  });

  it('pendant le tournoi, l’arène se dessine sans ses combattants (un autre modèle), et les retrouve après', () => {
    for (const age of [1, 2, 3, 4, 5]) {
      const o = { v: 0, L: false, R: false, F: false };
      const full = getModel('arena', age, o), bare = getModel('arena', age, { ...o, bare: true });
      expect(bare).not.toBe(full);
      expect(bare.body.getAttribute('position').count).toBeLessThan(full.body.getAttribute('position').count);
      expect(getModel('arena', age, o)).toBe(full);
    }
  });
});
