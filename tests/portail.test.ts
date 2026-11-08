import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, VEG_VOLCANO } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { landDistance, ISLE_R, ISLE_MIN, STRAIT_MIN, PORTAL_CELLS, ISLE_SECURE, holdIsle, repelWave, isleDefenses, isleManned, isleProgress, isleSecured, isleSteps } from '../src/world/portal';
import { SECURE_WAVES } from '../src/sim/hell';
import { isleOrigins, zoneOrigins, isZoned as isleZoned } from '../src/build/zones';

/** Les cases de terre reliées (à pied, de proche en proche) à la case donnée */
function landFrom(w: World, cx: number, cz: number) {
  const m = new Uint8Array(N * N), st = [w.ci(cx, cz)];
  m[st[0]] = 1;
  while (st.length) {
    const k = st.pop()!, x = k % N, z = (k - x) / N;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!w.inCells(nx, nz)) continue;
      const j = w.ci(nx, nz);
      if (!m[j] && w.cellAvg(nx, nz) > -0.35) { m[j] = 1; st.push(j); }
    }
  }
  return m;
}

describe('l’île du portail', () => {
  beforeAll(() => setMapSize(192));
  // (1184, 2920 : un continent qui laisse peu de large, dont la côte recule pour faire place à l'île)
  const seeds = [1, 2, 3, 7, 42, 99, 123, 555, 2026, 31337, 77777, 4242, 1184, 2920];

  it('chaque continent généré a son île, au large, séparée du continent par un bras de mer', () => {
    for (const seed of seeds) {
      const w = new World();
      newWorld(w, 3, seed, GEN);
      const p = w.portal!;
      expect(p, `graine ${seed}`).toBeTruthy();
      expect(p.r).toBeGreaterThanOrEqual(ISLE_MIN);
      expect(p.r).toBeLessThanOrEqual(ISLE_R[1]);
      // l'île : la terre autour du portail, d'un seul tenant, de 12 à 18 cases de diamètre
      const isle = landFrom(w, p.x, p.z);
      let x0 = N, x1 = 0, z0 = N, z1 = 0, n = 0;
      for (let k = 0; k < N * N; k++) if (isle[k]) { n++; const x = k % N, z = (k - x) / N; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      expect(x1 - x0 + 1, `graine ${seed}`).toBeGreaterThanOrEqual(11);
      expect(x1 - x0 + 1, `graine ${seed}`).toBeLessThanOrEqual(33);
      expect(z1 - z0 + 1, `graine ${seed}`).toBeLessThanOrEqual(33);
      // elle reste entière dans la carte, avec de la mer tout autour
      expect(Math.min(x0, z0)).toBeGreaterThanOrEqual(2);
      expect(Math.max(x1, z1)).toBeLessThanOrEqual(N - 3);
      // pas reliée au continent ni à une autre île : tout ce qui lui est relié est dans son disque
      for (let k = 0; k < N * N; k++) if (isle[k]) expect(w.onPortalIsland(k % N, Math.floor(k / N))).toBe(true);
      // le bras de mer : aucune autre terre à moins de STRAIT_MIN cases (à peu près) de son rivage
      for (let k = 0; k < N * N; k++) {
        const x = k % N, z = (k - x) / N;
        if (isle[k] || w.cellAvg(x, z) <= -0.35) continue;
        expect(Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z), `graine ${seed}`).toBeGreaterThan(p.r + STRAIT_MIN - 2);
      }
      // le continent (le village au milieu) est bien plus grand
      const main = landFrom(w, ...w.startSpot());
      expect(main[w.ci(p.x, p.z)]).toBe(0);
      expect(main.reduce((s, v) => s + v, 0)).toBeGreaterThan(n * 20);
      // le portail se dresse sur un replat
      for (const [cx, cz] of PORTAL_CELLS(p)) { expect(w.cellSlope(cx, cz)).toBeLessThan(0.05); expect(w.cellAvg(cx, cz)).toBeGreaterThan(1); expect(w.veg[w.ci(cx, cz)]).toBe(0); }
    }
  }, 120000);

  it('elle est la même pour une même graine, et change d’une graine à l’autre', () => {
    const a = new World(), b = new World(), c = new World();
    newWorld(a, 3, 4242, GEN); newWorld(b, 3, 4242, GEN); newWorld(c, 3, 99, GEN);
    expect(a.portal).toEqual(b.portal);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(a.portal).not.toEqual(c.portal);
  });

  it('elle ne touche ni au volcan ni au continent : seulement la haute mer autour d’elle', () => {
    for (const seed of [7, 2026]) {
      const w = new World();
      newWorld(w, 3, seed, GEN);
      const p = w.portal!;
      for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) expect(Math.hypot((k % N) + 0.5 - p.x, Math.floor(k / N) + 0.5 - p.z)).toBeGreaterThan(p.r + 8);
      const d = landDistance(w);
      expect(d[w.ci(p.x, p.z)]).toBe(0);
    }
  });

  it('se sauvegarde et se recharge ; une ancienne sauvegarde se charge sans île', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const json = JSON.parse(JSON.stringify(w.toJSON()));
    const v = new World();
    v.fromJSON(json);
    expect(v.portal).toEqual(w.portal);
    expect(v.portalIsland!.reduce((s, x) => s + x, 0)).toBe(w.portalIsland!.reduce((s, x) => s + x, 0));
    // une partie d'avant l'île
    delete json.portal;
    const old = new World();
    old.fromJSON(json);
    expect(old.portal).toBeNull();
    expect(old.portalIsland).toBeNull();
    expect(old.onPortalIsland(10, 10)).toBe(false);
    // une île abîmée ne casse rien
    old.fromJSON({ ...json, portal: { x: 'a', z: 3 } });
    expect(old.portal).toBeNull();
  });

  it('on n’y bâtit que les défenses, une fois le portail ouvert ; les défenses se bâtissent aussi au village', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const p = w.portal!, [sx, sz] = w.startSpot();
    // portail fermé : aucune défense sur l'île (au village, l'expédition verrouille l'onglet, pas la carte)
    expect(isleOrigins(w, 'watchtower')).toEqual([]);
    expect(w.canPlace('watchtower', p.x + 2, p.z)).toMatch(/ouvrir le portail/);
    w.exp.done.push('portal');
    expect(w.portalOpen).toBe(true);
    const towers = isleOrigins(w, 'watchtower'), camps = isleOrigins(w, 'barracks');
    expect(towers.length).toBeGreaterThan(20);
    expect(camps.length).toBeGreaterThan(8);
    for (const k of [...towers, ...camps]) expect(w.onPortalIsland(k % N, Math.floor(k / N))).toBe(true);
    // pas sur le portail ; au village, oui (une tour de garde dans les rues)
    expect(w.canPlace('watchtower', p.x - 1, p.z - 1)).toMatch(/portail se dresse/);
    expect(w.canPlace('watchtower', sx + 4, sz + 4)).toBeNull();
    expect(w.canPlace('barracks', sx + 4, sz + 4)).toBeNull();
    // ni maison ni ferme sur l'île
    expect(w.canPlace('house', p.x + 2, p.z)).toMatch(/que des défenses/);
    expect(zoneOrigins(w, 'house').some((k) => w.onPortalIsland(k % N, Math.floor(k / N)))).toBe(false);
    // une tour posée sur l'île y reste
    const k = towers[0];
    w.place('watchtower', k % N, Math.floor(k / N), 0, true, 1, false);
    expect([...w.buildings.values()].some((b) => b.kind === 'watchtower')).toBe(true);
    // sans île (ancienne partie) : les défenses se bâtissent quand même au village
    const old = new World();
    const json = w.toJSON() as Record<string, unknown>;
    delete json.portal;
    old.fromJSON(json);
    expect(old.canPlace('watchtower', sx + 4, sz + 4)).toBeNull();
  });

  it('l’île se sécurise : défenses debout, puis vagues repoussées (les jours tenus ne sont qu’un relevé) ; le compte se sauvegarde', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    // (les défenses ne sont plus des bâtiments de zone : elles se posent au village aussi)
    expect(isleZoned('watchtower') || isleZoned('barracks')).toBe(false);
    expect(ISLE_SECURE.waves).toBe(SECURE_WAVES);
    // sans portail ouvert ni défenses, le temps ne compte pas
    holdIsle(w, 1000, 100);
    expect(w.isleGuard.days).toBe(0);
    expect(isleSecured(w)).toBe(false);
    w.exp.done.push('portal');
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    holdIsle(w, 1000, 100);
    expect(isleManned(w)).toBe(false);
    expect(w.isleGuard.days).toBe(0);
    expect(isleSteps(w).map((x) => x.have)).toEqual([1, 0, 0]);
    const c = isleOrigins(w, 'barracks')[0];
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
    expect(isleDefenses(w)).toEqual({ towers: 1, barracks: 1 });
    holdIsle(w, 300, 100);
    expect(w.isleGuard.days).toBeCloseTo(3);
    // tenir des jours ne suffit plus : il faut repousser les vagues
    holdIsle(w, 10000, 100);
    expect(isleProgress(w)).toBe(0);
    for (let i = 0; i < ISLE_SECURE.waves - 1; i++) repelWave(w);
    expect(isleSecured(w)).toBe(false);
    expect(isleSteps(w)[2]).toMatchObject({ have: ISLE_SECURE.waves - 1, need: ISLE_SECURE.waves });
    repelWave(w);
    expect(isleSecured(w)).toBe(true);
    expect(isleSteps(w).every((x) => x.have >= x.need)).toBe(true);
    const v = new World();
    v.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(v.isleGuard.waves).toBe(ISLE_SECURE.waves);
    expect(isleSecured(v)).toBe(true);
  });
});
