import { describe, expect, it } from 'vitest';
import { creditedSeconds, MAX_SECONDS, parisDay, parsePing } from '../worker/ping';
import { ageSpread, buildReport, dayBefore, duration, median, type PlayerRow } from '../worker/stats';
import { loginPage, reportPage } from '../worker/bo';
import { payload, startAudience, uuid } from '../src/audience';

const P = '0f8fad5b-d9cb-469f-a165-70867728950e', S = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ok = { p: P, s: S, k: 'tick', t: 60, a: 2, m: 'normal', d: 'easy', l: 'fr', b: '2026-11-26.972bc4e' };
const js = (o: object) => JSON.stringify(o);

describe('mesure d’audience : validation des signaux', () => {
  it('accepte un signal bien formé et ne garde que les champs connus', () => {
    expect(parsePing(js({ ...ok, extra: 'x', r: 'new' }))).toEqual({ ...ok, r: 'new' });
  });
  it('refuse les types, tailles et valeurs hors liste', () => {
    const bad: [string, object][] = [
      ['joueur', { p: 'pas-un-uuid' }], ['joueur', { p: P.toUpperCase() }], ['partie', { s: 3 }], ['type', { k: 'boom' }],
      ['secondes', { t: -1 }], ['secondes', { t: 1.5 }], ['secondes', { t: 99999 }], ['âge', { a: 6 }], ['âge', { a: '2' }],
      ['mode', { m: 'admin' }], ['difficulté', { d: 'hard' }], ['langue', { l: 'de' }], ['version', { b: '<script>' }],
      ['version', { b: 'x'.repeat(33) }], ['lancement', { r: 'peut-être' }],
    ];
    for (const [why, o] of bad) expect(parsePing(js({ ...ok, ...o }))).toBe(why);
    expect(parsePing('{')).toBe('JSON illisible');
    expect(parsePing('[1]')).toBe('pas un objet');
    expect(parsePing(js({ ...ok, pad: 'x'.repeat(700) }))).toBe('trop long');
  });
  it('borne les secondes créditées par le temps réel écoulé', () => {
    expect(creditedSeconds({ k: 'start', t: 60 }, 1000, null)).toBe(0);
    expect(creditedSeconds({ k: 'tick', t: 60 }, 1000, 900)).toBe(60);
    expect(creditedSeconds({ k: 'tick', t: 60 }, 1000, 995)).toBe(15);
    expect(creditedSeconds({ k: 'tick', t: 3600 }, 1000, null)).toBe(MAX_SECONDS);
    expect(creditedSeconds({ k: 'age', t: 30 }, 1000, 1010)).toBe(10);
  });
  it('donne le jour à l’heure de Paris', () => {
    // 23 h 30 UTC le 26 novembre : déjà le 27 à Paris
    expect(parisDay(Date.UTC(2026, 10, 26, 23, 30) / 1000)).toBe('2026-11-27');
    expect(dayBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(dayBefore('2026-11-27', 29)).toBe('2026-10-29');
  });
});

describe('mesure d’audience : calculs du back-office', () => {
  it('médiane', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([10, 1, 3, 4])).toBe(3.5);
  });
  it('âges atteints : chaque âge compté, le bac à sable à part', () => {
    const { ages, sandboxOnly } = ageSpread([{ max_age: 0 }, { max_age: 0 }, { max_age: 2 }, { max_age: -1 }, { max_age: 5 }]);
    expect(ages.map((a) => a.players)).toEqual([2, 0, 1, 0, 0, 1]);
    expect(ages[2].name).toBe('Médiéval');
    expect(sandboxOnly).toBe(1);
  });
  it('rapport : joueurs du jour et de la semaine, temps, 30 jours', () => {
    const now = Date.UTC(2026, 10, 26, 12) / 1000, day = 86400;
    const pl = (id: string, last: number, seconds: number, max_age: number): PlayerRow => ({ id, first_at: last - day, last_at: last, seconds, max_age, lang: 'fr', sessions: 1 });
    const players = [pl('a', now, 600, 1), pl('b', now - 3 * day, 1200, 2), pl('c', now - 10 * day, 60, 0)];
    const r = buildReport(players, [{ started_at: now, seconds: 300 }, { started_at: now - day, seconds: 300 }, { started_at: now - 3 * day, seconds: 1260 }],
      [{ day: '2026-11-26', players: 1, seconds: 600 }, { day: '2026-01-01', players: 9, seconds: 9 }], now);
    expect(r.players).toEqual({ today: 1, week: 2, total: 3 });
    expect(r.sessions).toEqual({ today: 1, total: 3 });
    expect(r.time.total).toBe(1860);
    expect(r.time.perPlayer).toEqual({ mean: 620, median: 600 });
    expect(r.time.perSession).toEqual({ mean: 620, median: 300 });
    expect(r.days).toHaveLength(30);
    expect(r.days[29]).toEqual({ day: '2026-11-26', players: 1, seconds: 600 });
    expect(r.days[0].day).toBe('2026-10-28');
    expect(r.list.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    const page = reportPage(r);
    expect(page).toContain('Âge le plus haut atteint');
    expect(page).toContain('10 min');
    expect(loginPage(true)).toContain('Clé incorrecte');
  });
  it('durées lisibles', () => {
    expect(duration(45)).toBe('45 s');
    expect(duration(720)).toBe('12 min');
    expect(duration(3 * 3600 + 5 * 60)).toBe('3 h 05');
    expect(duration(3599 + 3600)).toBe('2 h 00');
  });
});

describe('mesure d’audience : côté jeu', () => {
  const st = { age: () => 3, mode: () => 'hell' as const, difficulty: () => 'normal' as const, lang: () => 'en' as const };
  it('le signal du jeu passe la validation du serveur', () => {
    const body = payload(uuid(), uuid(), 'start', 0, st, 'continue');
    const p = parsePing(body);
    expect(typeof p).toBe('object');
    expect(p).toMatchObject({ k: 'start', a: 3, m: 'hell', l: 'en', r: 'continue' });
  });
  it('rien ne part dans les tests', () => {
    expect(startAudience(st, 'new')).toBeNull();
  });
});
