import { describe, it, expect, beforeAll } from 'vitest';
import {
  END_PLAN, END_TOTAL, END_CAPTIONS, END_FADE, endShotAt, endShotStart, endCaptionAt, endBlackAt, endFlashAt, shouldPlayKingdomEnd,
} from '../src/kingdomEnd';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War } from '../src/sim/war';
import { hellFallen } from '../src/sim/kingdom';

describe('La cinématique de fin du volet militaire : la partition', () => {
  it('dure entre 25 et 30 secondes, en cinq plans qui se suivent sans trou', () => {
    expect(END_TOTAL).toBeGreaterThanOrEqual(25);
    expect(END_TOTAL).toBeLessThanOrEqual(30);
    expect(END_PLAN.map((p) => p.id)).toEqual(['collapse', 'travel', 'portal', 'isle', 'village']);
    let t = 0;
    for (const p of END_PLAN) {
      expect(endShotStart(p.id)).toBeCloseTo(t);
      expect(endShotAt(t + 0.01)!.shot).toBe(p.id);
      expect(endShotAt(t + p.dur - 0.01)!.shot).toBe(p.id);
      t += p.dur;
    }
    expect(endShotAt(END_TOTAL)).toBeNull();
    expect(endShotAt(END_TOTAL + 5)).toBeNull();
  });

  it('l’avancée dans un plan va de 0 à 1', () => {
    const s = endShotAt(endShotStart('isle') + END_PLAN[3].dur / 2)!;
    expect(s.shot).toBe('isle');
    expect(s.k).toBeCloseTo(0.5);
    expect(s.local).toBeCloseTo(END_PLAN[3].dur / 2);
  });

  it('trois bandeaux, chacun dans son plan, qui apparaissent et s’effacent en douceur', () => {
    expect(END_CAPTIONS.map((c) => c.text)).toEqual(['Le roi des Enfers est tombé', 'Le portail s’éteint', 'L’île est sauvée']);
    for (const c of END_CAPTIONS) {
      const t0 = endShotStart(c.shot), dur = END_PLAN.find((p) => p.id === c.shot)!.dur;
      expect(c.at + c.dur).toBeLessThanOrEqual(dur);
      expect(endCaptionAt(t0 + c.at - 0.1)).toBeNull();
      expect(endCaptionAt(t0 + c.at + 0.05)!.alpha).toBeLessThan(0.2);
      const mid = endCaptionAt(t0 + c.at + c.dur / 2)!;
      expect(mid.text).toBe(c.text);
      expect(mid.alpha).toBe(1);
      expect(endCaptionAt(t0 + c.at + c.dur - 0.05)!.alpha).toBeLessThan(0.2);
    }
    // jamais deux bandeaux à la fois
    for (let t = 0; t < END_TOTAL; t += 0.05) expect([endCaptionAt(t)].filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it('le fondu au noir ne vient qu’à la fin, la lumière enchaîne les Enfers et la surface', () => {
    expect(endBlackAt(0)).toBe(0);
    expect(endBlackAt(END_TOTAL - END_FADE - 0.1)).toBe(0);
    expect(endBlackAt(END_TOTAL - END_FADE / 2)).toBeCloseTo(0.5);
    expect(endBlackAt(END_TOTAL)).toBe(1);
    const travel = endShotStart('travel');
    expect(endFlashAt(1)).toBe(0);
    expect(endFlashAt(travel)).toBeCloseTo(1);
    expect(endFlashAt(travel - 0.6)).toBeGreaterThan(0.3);
    expect(endFlashAt(travel + END_PLAN[1].dur + 0.1)).toBe(0);
    expect(endFlashAt(endShotStart('portal') + 2)).toBe(0);
  });
});

describe('La cinématique de fin : une seule fois', () => {
  beforeAll(() => setMapSize(192));

  it('le drapeau dit si elle se joue ; le mode développeur force', () => {
    expect(shouldPlayKingdomEnd({ endSeen: false })).toBe(true);
    expect(shouldPlayKingdomEnd({ endSeen: true })).toBe(false);
    expect(shouldPlayKingdomEnd({ endSeen: true }, true)).toBe(true);
  });

  it('le drapeau est sauvegardé ; une ancienne sauvegarde (sans drapeau) le trouve éteint', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const war = new War(w);
    expect(war.endSeen).toBe(false);
    war.endSeen = true;
    const back = new War(w);
    back.load(JSON.parse(JSON.stringify(war.save())));
    expect(back.endSeen).toBe(true);
    const old = new War(w);
    const s = JSON.parse(JSON.stringify(war.save()));
    delete s.endSeen;
    old.load(s);
    expect(old.endSeen).toBe(false);
  });

  it('la chute du roi annonce la victoire une seule fois : la cinématique n’est lancée que par cette nouvelle', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const war = new War(w);
    const tick = (n: number) => { for (let i = 0; i < n * 10; i++) war.update(0.1, 1); };
    tick(0.5);
    war.faction!.damage(war.king!.citadel!, 1e7, -1);
    tick(0.3);
    expect(hellFallen(w)).toBe(true);
    expect(war.news.filter((n) => n.kind === 'victory')).toHaveLength(1);
    tick(5);
    expect(war.news.filter((n) => n.kind === 'victory')).toHaveLength(1);
    // une partie reprise où le royaume était déjà tombé : aucune nouvelle de victoire, donc aucune cinématique
    const back = new War(w);
    back.load(JSON.parse(JSON.stringify(war.save())));
    for (let i = 0; i < 50; i++) back.update(0.1, 1);
    expect(back.news.filter((n) => n.kind === 'victory')).toHaveLength(0);
  });
});
