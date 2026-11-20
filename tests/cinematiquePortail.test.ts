import { describe, it, expect } from 'vitest';
import { PORTAL_PLAN, PORTAL_TOTAL, PORTAL_CAPTIONS, PORTAL_CUT, portalShotAt, portalCaptionAt, portalVeilAt, portalCineReady } from '../src/portalCine';
import { World } from '../src/world/world';
import { War } from '../src/sim/war';

describe('la cinématique du portail : la partition', () => {
  it('cinq plans, de 15 à 30 s, dans l’ordre voulu par l’auteur', () => {
    expect(PORTAL_PLAN.map((p) => p.id)).toEqual(['awaken', 'dive', 'threshold', 'embers', 'back']);
    expect(PORTAL_TOTAL).toBeGreaterThanOrEqual(15);
    expect(PORTAL_TOTAL).toBeLessThanOrEqual(30);
    expect(portalShotAt(0)?.shot).toBe('awaken');
    expect(portalShotAt(PORTAL_CUT)?.shot).toBe('threshold');
    expect(portalShotAt(PORTAL_TOTAL)).toBeNull();
  });

  it('chaque bandeau tient dans son plan, et paraît à l’écran', () => {
    for (const c of PORTAL_CAPTIONS) {
      const p = PORTAL_PLAN.find((x) => x.id === c.shot)!;
      expect(c.at + c.dur).toBeLessThanOrEqual(p.dur);
    }
    let t0 = 0;
    for (const p of PORTAL_PLAN) {
      const c = PORTAL_CAPTIONS.find((x) => x.shot === p.id);
      if (c) expect(portalCaptionAt(t0 + c.at + c.dur / 2)?.text).toBe(c.text);
      t0 += p.dur;
    }
  });

  it('le noir est complet à la coupe vers les Enfers, l’éclair violet le précède, puis le noir se lève', () => {
    expect(portalVeilAt(PORTAL_CUT - 0.001).black).toBeGreaterThan(0.99);
    expect(portalVeilAt(PORTAL_CUT).black).toBe(1);
    expect(portalVeilAt(PORTAL_CUT - 0.7).flash).toBeGreaterThan(0.9);
    expect(portalVeilAt(PORTAL_CUT + 2).black).toBe(0);
    // ni noir ni éclair au milieu des plans
    expect(portalVeilAt(2.5)).toEqual({ flash: 0, black: 0 });
    expect(portalVeilAt(PORTAL_CUT + 8).black).toBe(0);
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
