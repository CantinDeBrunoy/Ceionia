import { describe, it, expect, afterEach } from 'vitest';
import { END_FILM, END_FILM_SRC, endFilmCaptionAt } from '../src/endFilm';
import { setLang } from '../src/i18n';
import '../src/i18n/en';

afterEach(() => setLang('fr', false));

describe('le film de fin', () => {
  it('a deux bandeaux, un par plan, qui tiennent dans le film et ne se chevauchent pas', () => {
    const [a, b] = END_FILM.captions;
    expect(END_FILM.captions.length).toBe(2);
    expect(a.at + a.dur).toBeLessThanOrEqual(END_FILM.cut);
    expect(b.at).toBeGreaterThanOrEqual(END_FILM.cut);
    expect(b.at + b.dur).toBeLessThanOrEqual(END_FILM.dur);
  });

  it('dit le bandeau du moment, en douceur, et rien entre deux', () => {
    expect(endFilmCaptionAt(0.2)).toBeNull();
    expect(endFilmCaptionAt(3)!.text).toBe('Le grand départ');
    expect(endFilmCaptionAt(3)!.alpha).toBe(1);
    expect(endFilmCaptionAt(0.95)!.alpha).toBeLessThan(1);
    expect(endFilmCaptionAt(7.2)).toBeNull();
    expect(endFilmCaptionAt(9.5)!.text).toBe('Une terre nouvelle');
    for (const c of END_FILM.captions) expect(c.text() + c.sub()).not.toContain(';');
  });

  it('se traduit en anglais', () => {
    setLang('en', false);
    expect(endFilmCaptionAt(3)!.text).toBe('The great departure');
    expect(endFilmCaptionAt(9.5)!.sub).toBe('beyond the stars');
  });

  it('essaie la WebM, puis le MP4', () => {
    expect(END_FILM_SRC.map((s) => s.src)).toEqual(['./fin/fin.webm', './fin/fin.mp4']);
  });
});
