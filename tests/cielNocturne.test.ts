import { describe, it, expect } from 'vitest';
import { nightShow, nightOf, auroraChance, meteorRate, METEOR_RATE, MeteorKind } from '../src/core/skyNights';
import { GameTime } from '../src/core/time';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';
import { skyNewsText } from '../src/render/nightSky';

const NIGHTS = 20000;

/** Part des nuits qui ont une aurore, et répartition des étoiles filantes, pour une saison et un froid donnés */
function stats(season: number, cold: number, salt = 7) {
  let aurora = 0;
  const met: Record<MeteorKind, number> = { none: 0, lone: 0, some: 0, shower: 0 };
  let twice = 0, prev = false;
  for (let n = 0; n < NIGHTS; n++) {
    const s = nightShow(n, season, cold, salt);
    if (s.aurora > 0) aurora++;
    met[s.meteors]++;
    const sh = s.meteors === 'shower';
    if (sh && prev) twice++;
    prev = sh;
  }
  return { aurora: aurora / NIGHTS, none: met.none / NIGHTS, lone: met.lone / NIGHTS, some: met.some / NIGHTS, shower: met.shower / NIGHTS, twice };
}

describe('ciel de nuit : aurores et étoiles filantes', () => {
  it('le tirage ne dépend que de la nuit, de la saison, du froid et du sel', () => {
    for (let n = 0; n < 200; n++) expect(nightShow(n, 3, 0.2, 11)).toEqual(nightShow(n, 3, 0.2, 11));
    // un autre sel (une autre partie) donne un autre programme
    const a = Array.from({ length: 200 }, (_, n) => nightShow(n, 3, 0.2, 11).aurora > 0);
    const b = Array.from({ length: 200 }, (_, n) => nightShow(n, 3, 0.2, 12).aurora > 0);
    expect(a).not.toEqual(b);
  });

  it('les aurores : plus souvent l’hiver et sur une carte froide, rares l’été', () => {
    const winterCold = stats(3, 0.3), winterWarm = stats(3, 0), summerWarm = stats(1, 0), autumnWarm = stats(2, 0);
    expect(winterCold.aurora).toBeGreaterThan(0.55);
    expect(winterCold.aurora).toBeLessThan(0.75);
    expect(winterWarm.aurora).toBeGreaterThan(0.25);
    expect(winterWarm.aurora).toBeLessThan(0.35);
    expect(summerWarm.aurora).toBeLessThan(0.04);
    expect(winterWarm.aurora).toBeGreaterThan(autumnWarm.aurora);
    expect(autumnWarm.aurora).toBeGreaterThan(summerWarm.aurora);
    // le froid compte jusqu'à un quart de terres froides, pas au-delà
    expect(auroraChance(3, 0.25)).toBeCloseTo(auroraChance(3, 0.9));
    expect(auroraChance(3, 0.1)).toBeGreaterThan(auroraChance(3, 0));
  });

  it('une aurore a une force : parfois un voile, parfois tout le ciel', () => {
    const forces = Array.from({ length: 4000 }, (_, n) => nightShow(n, 3, 0.3, 5).aurora).filter((a) => a > 0);
    expect(Math.min(...forces)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...forces)).toBeLessThanOrEqual(1);
    expect(Math.max(...forces) - Math.min(...forces)).toBeGreaterThan(0.3);
  });

  it('étoiles filantes : une grande nuit de temps en temps, jamais deux de suite ; une étoile isolée d’autres nuits', () => {
    for (const season of [0, 1, 2, 3]) {
      const s = stats(season, 0);
      expect(s.twice).toBe(0);
      expect(s.shower).toBeGreaterThan(0.03);
      expect(s.shower).toBeLessThan(0.12);
      expect(s.lone).toBeGreaterThan(0.2);
      expect(s.some).toBeGreaterThan(0.1);
      expect(s.none).toBeGreaterThan(0.3);
    }
    // plus souvent l'été (Perséides) qu'au printemps
    expect(stats(1, 0).shower).toBeGreaterThan(stats(0, 0).shower * 1.5);
  });

  it('les cadences : la grande nuit bien plus dense que les autres, rien les nuits sans étoile filante', () => {
    expect(METEOR_RATE.none).toBe(0);
    expect(METEOR_RATE.lone).toBeGreaterThan(0);
    expect(METEOR_RATE.some).toBeGreaterThan(METEOR_RATE.lone * 3);
    expect(METEOR_RATE.shower).toBeGreaterThan(METEOR_RATE.some * 8);
    // une nuit (environ 25 s de jeu en pleine nuit) : une étoile isolée, quelques-unes, ou des dizaines
    expect(METEOR_RATE.lone * 25).toBeGreaterThan(0.6);
    expect(METEOR_RATE.lone * 25).toBeLessThan(1.6);
    expect(METEOR_RATE.shower * 25).toBeGreaterThan(40);
  });

  it('la durée du jour : l’étoile isolée reste seule par nuit, l’averse s’étale sans disparaître', () => {
    // une nuit dure à peu près le quart de la journée en pleine obscurité
    const perNight = (k: MeteorKind, dayLen: number) => meteorRate(k, dayLen) * dayLen * 0.25;
    for (const d of [30, 100, 400]) expect(perNight('lone', d)).toBeCloseTo(perNight('lone', 100));
    expect(meteorRate('shower', 100)).toBe(METEOR_RATE.shower);
    expect(perNight('shower', 400)).toBeGreaterThan(perNight('shower', 100));
    expect(meteorRate('shower', 400)).toBeGreaterThan(meteorRate('some', 30));
    expect(meteorRate('none', 30)).toBe(0);
  });

  it('la nuit commence le soir et finit au matin : un seul numéro du coucher au lever', () => {
    expect(nightOf(4, 20)).toBe(4);
    expect(nightOf(5, 3)).toBe(4);
    expect(nightOf(5, 13)).toBe(5);
    // en suivant l'horloge du jeu, le numéro ne change qu'à midi
    const t = new GameTime();
    t.hour = 13;
    let last = nightOf(t.days, t.hour), changes = 0;
    for (let i = 0; i < 2000; i++) {
      t.update(0.1);
      const n = nightOf(t.days, t.hour);
      if (n !== last) { changes++; expect(t.hour).toBeGreaterThanOrEqual(12); expect(t.hour).toBeLessThan(13); last = n; }
    }
    expect(changes).toBe(2);
  });

  it('les annonces sont traduites', () => {
    setLang('en', false);
    for (const t of [skyNewsText('aurora', false), skyNewsText('shower', false), skyNewsText('shower', true)]) expect(t).not.toMatch(/[éèàç]|Cliquez/);
    setLang('fr', false);
    expect(skyNewsText('shower', false)).toBe(tr('🌠 Nuit des étoiles filantes ! Cliquez ici pour lever les yeux.'));
  });
});
