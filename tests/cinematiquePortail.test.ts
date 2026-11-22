import { describe, it, expect } from 'vitest';
import { PORTAL_FILM, PORTAL_LIVE, LIVE_TOTAL, PORTAL_FALLBACK, PORTAL_CAPTIONS, portalShotAt, portalCaptionAt, portalFilmCaptionAt, portalBlackAt, fallbackAt, portalCineReady } from '../src/portalCine';
import { World } from '../src/world/world';
import { War } from '../src/sim/war';

describe('la cinématique du portail : la partition', () => {
  it('le film (une vidéo de 20 s de Veo, qui montre aussi les Grottes de braise), puis le direct au Seuil ; environ 28 s en tout', () => {
    expect(PORTAL_FILM.dur).toBe(20);
    expect(PORTAL_FILM.webm).toMatch(/\.webm$/);
    expect(PORTAL_FILM.mp4).toMatch(/\.mp4$/);
    expect(PORTAL_LIVE.map((p) => p.id)).toEqual(['threshold', 'back']);
    expect(PORTAL_FILM.dur + LIVE_TOTAL).toBeGreaterThanOrEqual(25);
    expect(PORTAL_FILM.dur + LIVE_TOTAL).toBeLessThanOrEqual(32);
    expect(portalShotAt(0)?.shot).toBe('threshold');
    expect(portalShotAt(LIVE_TOTAL)).toBeNull();
    expect(PORTAL_FALLBACK).toBeLessThan(PORTAL_FILM.dur);
  });

  it('chaque bandeau tient dans son plan, et paraît à l’écran', () => {
    for (const c of PORTAL_FILM.captions) {
      expect(c.at + c.dur).toBeLessThanOrEqual(PORTAL_FILM.dur);
      expect(portalFilmCaptionAt(c.at + c.dur / 2)?.text).toBe(c.text);
    }
    for (const c of PORTAL_CAPTIONS) expect(c.at + c.dur).toBeLessThanOrEqual(PORTAL_LIVE.find((x) => x.id === c.shot)!.dur);
    let t0 = 0;
    for (const p of PORTAL_LIVE) {
      const c = PORTAL_CAPTIONS.find((x) => x.shot === p.id);
      if (c) expect(portalCaptionAt(t0 + c.at + c.dur / 2)?.text).toBe(c.text);
      t0 += p.dur;
    }
  });

  it('le direct s’ouvre sur le noir où le film a fini, le lève, et se ferme d’un court fondu', () => {
    expect(portalBlackAt(0)).toBe(1);
    expect(portalBlackAt(2)).toBe(0);
    expect(portalBlackAt(LIVE_TOTAL)).toBe(1);
    // le fondu de remplacement : le tourbillon grandit, puis le noir le recouvre
    expect(fallbackAt(0)).toEqual({ grow: 0, black: 0 });
    expect(fallbackAt(PORTAL_FALLBACK).black).toBe(1);
  });

  it('elle attend le calme : jamais par-dessus un récit d’expédition, une fenêtre, une pose ou une autre cinématique', () => {
    const ok = { due: true, surface: true, calm: true, reports: false, busyHands: false, otherCine: false };
    expect(portalCineReady(ok)).toBe(true);
    expect(portalCineReady({ ...ok, due: false })).toBe(false);
    expect(portalCineReady({ ...ok, reports: true })).toBe(false);
    expect(portalCineReady({ ...ok, busyHands: true })).toBe(false);
    expect(portalCineReady({ ...ok, calm: false })).toBe(false);
    expect(portalCineReady({ ...ok, otherCine: true })).toBe(false);
    expect(portalCineReady({ ...ok, surface: false })).toBe(false);
  });
});

describe('la cinématique du portail : une fois par partie', () => {
  it('une ancienne partie déjà allée aux Enfers ne la joue pas ; une neuve l’attend ; elle se sauvegarde', () => {
    const w = new World();
    const old = new War(w); old.load({ army: { troops: [], queue: [], nextId: 1 }, faction: null, visited: true });
    expect(old.intro).toBe('seen');
    const fresh = new War(w); fresh.load({ army: { troops: [], queue: [], nextId: 1 }, faction: null });
    expect(fresh.intro).toBe('none');
    expect(fresh.save().intro).toBeUndefined();
    fresh.intro = 'seen';
    const back = new War(w); back.load(JSON.parse(JSON.stringify(fresh.save())));
    expect(back.intro).toBe('seen');
  });
});
