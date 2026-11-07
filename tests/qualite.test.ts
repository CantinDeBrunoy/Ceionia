import { describe, it, expect } from 'vitest';
import { AdaptiveQuality, paramsAt, PRESETS, MAX_LEVEL } from '../src/render/adaptive';

/** `n` images de `ms` : le dernier palier annoncé (-1 si aucun changement) */
function feed(a: AdaptiveQuality, ms: number, n: number) {
  let last = -1;
  for (let i = 0; i < n; i++) { const l = a.step(ms); if (l >= 0) last = l; }
  return last;
}

describe('réglages effectifs par palier', () => {
  it('le palier 0 est le préréglage tel quel', () => {
    for (const p of ['high', 'medium', 'low'] as const) expect(paramsAt(p, 0)).toEqual(PRESETS[p]);
  });
  it('chaque palier rogne sans jamais remonter : finesse, ombres, distance des bêtes et des arbres', () => {
    for (const p of ['high', 'medium', 'low'] as const) {
      let prev = paramsAt(p, 0);
      for (let l = 1; l <= MAX_LEVEL; l++) {
        const cur = paramsAt(p, l);
        expect(cur.pixelRatio).toBeLessThanOrEqual(prev.pixelRatio);
        expect(cur.shadowSize).toBeLessThanOrEqual(prev.shadowSize);
        expect(cur.shadowEvery).toBeGreaterThanOrEqual(prev.shadowEvery);
        expect(cur.faunaDetail).toBeLessThanOrEqual(prev.faunaDetail);
        expect(cur.vegLod).toBeLessThanOrEqual(prev.vegLod);
        expect(cur.density).toBeLessThanOrEqual(prev.density);
        if (prev.glow === false) expect(cur.glow).toBe(false);
        if (prev.mist === false) expect(cur.mist).toBe(false);
        prev = cur;
      }
      // le dernier palier coûte nettement moins de pixels que le premier, sans tomber dans la bouillie
      expect(paramsAt(p, MAX_LEVEL).pixelRatio).toBeLessThanOrEqual(PRESETS[p].pixelRatio * 0.55);
      expect(paramsAt(p, MAX_LEVEL).pixelRatio).toBeGreaterThanOrEqual(0.5);
    }
  });
  it('le premier palier est discret (l’image à peine moins fine, rien d’autre)', () => {
    const p = paramsAt('high', 1);
    expect(p.pixelRatio).toBeCloseTo(1.35, 2);
    expect(p.shadowSize).toBe(2048);
    expect(p.glow).toBe(true);
    expect(p.faunaDetail).toBe(1);
  });
  it('le halo de nuit saute dès le deuxième palier', () => {
    expect(paramsAt('high', 2).glow).toBe(false);
  });
  it('un palier hors bornes est ramené dans les bornes', () => {
    expect(paramsAt('high', -3)).toEqual(PRESETS.high);
    expect(paramsAt('high', 99)).toEqual(paramsAt('high', MAX_LEVEL));
  });
});

describe('contrôleur Auto', () => {
  it('des images fluides ne changent rien', () => {
    const a = new AdaptiveQuality();
    expect(feed(a, 16, 2000)).toBe(-1);
    expect(a.level).toBe(0);
  });
  it('des images lentes pendant quelques secondes font descendre d’un palier, pas plus d’un à la fois', () => {
    const a = new AdaptiveQuality();
    // trois secondes de 40 ms : un palier
    expect(feed(a, 40, 75)).toBe(1);
    expect(a.level).toBe(1);
    // le temps de repos (3 s) : pas de second palier tout de suite
    expect(feed(a, 40, 50)).toBe(-1);
    // toujours lent : un palier de plus
    expect(feed(a, 40, 100)).toBe(2);
  });
  it('un à-coup isolé ne compte pas', () => {
    const a = new AdaptiveQuality();
    feed(a, 16, 300);
    a.step(400);
    expect(feed(a, 16, 300)).toBe(-1);
    expect(a.level).toBe(0);
  });
  it('ne descend jamais sous le dernier palier', () => {
    const a = new AdaptiveQuality();
    feed(a, 60, 20000);
    expect(a.level).toBe(MAX_LEVEL);
  });
  it('remonte doucement quand tout est stable, un palier à la fois', () => {
    const a = new AdaptiveQuality();
    feed(a, 40, 200);
    expect(a.level).toBe(2);
    // dix secondes de calme (plus le repos) : un palier remonté
    expect(feed(a, 10, 1500)).toBe(1);
    expect(a.level).toBe(1);
    expect(feed(a, 10, 1800)).toBe(0);
  });
  it('une remontée qui fait aussitôt traîner les images n’est retentée qu’après une attente doublée', () => {
    const a = new AdaptiveQuality();
    feed(a, 40, 200);
    const l = a.level;
    feed(a, 10, 1500);
    expect(a.level).toBe(l - 1);
    // ça traîne de nouveau : on redescend (huit secondes, repos compris : un seul palier)
    feed(a, 40, 200);
    expect(a.level).toBe(l);
    // dix secondes de calme ne suffisent plus
    expect(feed(a, 10, 1200)).toBe(-1);
    expect(a.level).toBe(l);
    // vingt, oui
    expect(feed(a, 10, 1200)).toBe(l - 1);
  });
  it('entre les deux seuils, rien ne bouge', () => {
    const a = new AdaptiveQuality();
    expect(feed(a, 20, 5000)).toBe(-1);
    feed(a, 40, 200);
    const l = a.level;
    expect(feed(a, 20, 5000)).toBe(-1);
    expect(a.level).toBe(l);
  });
});
