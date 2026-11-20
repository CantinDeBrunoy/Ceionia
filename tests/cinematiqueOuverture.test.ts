import { describe, it, expect } from 'vitest';
import { OPEN_FILM, OPEN_FALLBACK, OPEN_LIVE, OPEN_LIFT, OPEN_LIVE_CAPTION, openFilmCaptionAt, openFallbackPlan, openLiveCaptionAt, openCloudAt, openViewAt, openingDue } from '../src/openingCine';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

describe('la cinématique d’ouverture : la partition', () => {
  it('deux plans vidéo d’environ 10 s collés, puis le direct : environ 26 s, en WebM puis MP4', () => {
    expect(OPEN_FILM.dur).toBeCloseTo(19.58, 1);
    expect(OPEN_FILM.webm).toMatch(/^\.\/ouverture\/.*\.webm$/);
    expect(OPEN_FILM.mp4).toMatch(/^\.\/ouverture\/.*\.mp4$/);
    expect(OPEN_FILM.dur + OPEN_LIVE).toBeGreaterThanOrEqual(20);
    expect(OPEN_FILM.dur + OPEN_LIVE).toBeLessThanOrEqual(27);
    // (le fondu de remplacement est plus court que le film : sans vidéo, on attend moins)
    expect(OPEN_FALLBACK).toBeLessThan(OPEN_FILM.dur);
  });

  it('un bandeau par plan vidéo, chacun dans son plan, qui paraît et s’efface en douceur', () => {
    expect(OPEN_FILM.captions).toHaveLength(2);
    const [a, b] = OPEN_FILM.captions;
    expect(a.at + a.dur).toBeLessThanOrEqual(8);
    expect(b.at).toBeGreaterThanOrEqual(8);
    expect(b.at + b.dur).toBeLessThanOrEqual(OPEN_FILM.dur);
    for (const c of OPEN_FILM.captions) {
      expect(openFilmCaptionAt(c.at + c.dur / 2)).toMatchObject({ text: c.text, alpha: 1 });
      expect(openFilmCaptionAt(c.at)!.alpha).toBe(0);
    }
    expect(openFilmCaptionAt(0)).toBeNull();
    expect(openFilmCaptionAt(OPEN_FILM.dur)).toBeNull();
  });

  it('le fondu de remplacement garde les deux bandeaux, dans sa durée, puis la nuée le recouvre', () => {
    const p = openFallbackPlan();
    expect(p.captions.map((c) => c.text)).toEqual(OPEN_FILM.captions.map((c) => c.text));
    for (const c of p.captions) expect(c.delay + c.dur).toBeLessThanOrEqual(OPEN_FALLBACK);
    expect(p.captions[1].delay).toBeGreaterThanOrEqual(p.captions[0].delay + p.captions[0].dur);
    expect(p.cloudAt + p.cloudDur).toBeCloseTo(OPEN_FALLBACK);
  });

  it('le direct : la nuée se lève, le bandeau du foyer, et la vue finit exactement sur celle du départ', () => {
    expect(openCloudAt(0)).toBe(1);
    expect(openCloudAt(OPEN_LIFT)).toBe(0);
    expect(OPEN_LIVE_CAPTION.at + OPEN_LIVE_CAPTION.dur).toBeLessThanOrEqual(OPEN_LIVE);
    expect(openLiveCaptionAt(OPEN_LIVE_CAPTION.at + 2)?.text).toBe('Ici, ils allaient bâtir leur foyer');
    const to = { x: 90, z: 100, yaw: 0.75, pitch: 0.85, dist: 34 };
    const start = openViewAt(0, { x: 80, z: 120 }, to), end = openViewAt(1, { x: 80, z: 120 }, to);
    // (du ciel, au-dessus de la bête, en plongée)
    expect(start).toMatchObject({ x: 80, z: 120 });
    expect(start.dist).toBeGreaterThan(to.dist * 3);
    expect(start.pitch).toBeGreaterThan(1.2);
    for (const k of ['x', 'z', 'yaw', 'pitch', 'dist'] as const) expect(end[k]).toBeCloseTo(to[k]);
    // la vue descend sans jamais remonter
    let d = Infinity;
    for (let k = 0; k <= 1; k += 0.05) { const v = openViewAt(k, { x: 80, z: 120 }, to); expect(v.dist).toBeLessThanOrEqual(d + 1e-9); d = v.dist; }
  });

  it('une seule fois, au début d’une partie neuve : ni en reprenant, ni au bac à sable, ni coupée dans les paramètres', () => {
    const neuve = { fresh: true, sandbox: false, age: 0, off: false };
    expect(openingDue(neuve)).toBe(true);
    expect(openingDue({ ...neuve, fresh: false })).toBe(false);
    // (bac à sable et âge de départ avancé compris : toute partie neuve)
    expect(openingDue({ ...neuve, sandbox: true })).toBe(true);
    expect(openingDue({ ...neuve, sandbox: true, age: 2 })).toBe(true);
    expect(openingDue({ ...neuve, off: true })).toBe(false);
  });

  it('les textes affichés ont leur anglais, sans point-virgule', () => {
    const texts = [...OPEN_FILM.captions.flatMap((c) => [c.text, c.sub!]), OPEN_LIVE_CAPTION.text];
    for (const t of texts) expect(t).not.toContain(';');
    setLang('en', false);
    for (const t of texts) expect(tr(t)).not.toBe(t);
    setLang('fr', false);
  });
});
