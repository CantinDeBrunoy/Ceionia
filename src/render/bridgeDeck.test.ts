import { describe, expect, it } from 'vitest';
import { deckProfile, bridgeGroups } from './bridgeDeck';
import { World, N, setMapSize } from '../world/world';
import { planRoad } from '../build/freeRoad';

const line = (n: number, step = 0.2) => Array.from({ length: n }, (_, i) => i * step);

describe('profil du tablier d\'un petit pont', () => {
  it('est plat au-dessus de l\'eau et rejoint le sol aux deux pieds, sans à-coup', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map(() => 0.1);
    const p = deckProfile(S, wet, ground, 0.32, 0.14, 0.14);
    for (let i = 0; i < S.length; i++) if (S[i] >= p.a && S[i] <= p.b) expect(p.y[i]).toBeCloseTo(0.32);
    expect(p.y[0]).toBeCloseTo(0.14);
    expect(p.y[S.length - 1]).toBeCloseTo(0.14);
    // montée puis descente monotones
    const mid = p.y.indexOf(0.32);
    for (let i = 1; i <= mid; i++) expect(p.y[i]).toBeGreaterThanOrEqual(p.y[i - 1] - 1e-9);
    for (let i = p.y.length - 1; i > p.y.lastIndexOf(0.32); i--) expect(p.y[i - 1]).toBeGreaterThanOrEqual(p.y[i] - 1e-9);
  });

  it('ne passe jamais sous le sol, même quand la rive est plus haute que l\'eau', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map((s) => 0.4 + 0.1 * Math.sin(s));
    const p = deckProfile(S, wet, ground, 0.32, 0.45, 0.45);
    p.y.forEach((y, i) => expect(y).toBeGreaterThanOrEqual(ground[i] + 0.03 - 1e-9));
    expect(p.deck).toBeGreaterThan(0.32);
  });

  it('sans eau, il n\'y a pas de tablier plat', () => {
    const S = line(5), p = deckProfile(S, S.map(() => false), S.map(() => 0), 0.32, 0, 0);
    expect(p.a).toBeGreaterThan(p.b);
  });

  it('le tablier est continu de rive à rive : plat sur toute l\'eau, sans trou, même d\'un tronçon court à l\'autre', () => {
    // axe en courbe recoupé tous les 0,2 : les points mouillés forment un seul intervalle [a, b] sans interruption
    const S = line(40, 0.2), wet = S.map((s) => s >= 2.1 && s <= 5.5), ground = S.map((s) => 0.2 + 0.05 * Math.sin(s * 3));
    const p = deckProfile(S, wet, ground, 0.3, 0.2, 0.2);
    S.forEach((s, i) => { if (wet[i]) { expect(s).toBeGreaterThanOrEqual(p.a); expect(s).toBeLessThanOrEqual(p.b); expect(p.y[i]).toBeCloseTo(p.deck); } });
    // aucun saut de hauteur d'un tronçon au suivant (pas de marche, donc pas de vide)
    for (let i = 1; i < S.length; i++) expect(Math.abs(p.y[i] - p.y[i - 1])).toBeLessThan(0.12);
  });
});

describe('ponts : un seul ouvrage par franchissement, une seule route', () => {
  /** Terrain plat de 48 cases, des ruisseaux verticaux (sommets creusés) aux colonnes données */
  function flat(streams: number[], width = 2): World {
    setMapSize(48);
    const w = new World();
    w.heights.fill(0.55);
    for (const x of streams) for (let z = 0; z <= N; z++) for (let i = 0; i < width; i++) w.heights[w.vi(x + i, z)] = -0.6;
    w.updateVis();
    return w;
  }
  const row = (w: World, z: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) w.road[w.ci(x, z)] = 1; };

  it('une route droite sur un ruisseau : un seul pont, qui couvre toute l\'eau', () => {
    const w = flat([20]);
    row(w, 10, 8, 34);
    const g = bridgeGroups(w);
    expect(g.length).toBe(1);
    for (let x = 8; x <= 34; x++) if (w.isWet(x, 10)) expect(g[0]).toContain(w.ci(x, 10));
  });

  it('deux franchissements rapprochés du même ruisseau qui serpente : un seul pont', () => {
    const w = flat([16, 21]);
    row(w, 12, 6, 34);
    expect(bridgeGroups(w).length).toBe(1);
    // loin l'un de l'autre, ce sont deux ouvrages
    const w2 = flat([12, 28]);
    row(w2, 12, 4, 40);
    expect(bridgeGroups(w2).length).toBe(2);
  });

  it('une flaque ou une rive qui trempe à peine ne fait pas de pont', () => {
    const w = flat([]);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.heights[w.vi(20 + dx, 10 + dz)] = 0.04;
    w.updateVis();
    row(w, 10, 8, 34);
    expect(w.isWet(20, 10)).toBe(true);
    expect(w.bridgeY(20, 10)).toBeNull();
    expect(bridgeGroups(w).length).toBe(0);
  });

  it('une route libre contourne un ruisseau court plutôt que de le franchir', () => {
    const w = flat([]);
    for (let x = 20; x < 22; x++) for (let z = 0; z <= 22; z++) w.heights[w.vi(x, z)] = -0.6;
    w.updateVis();
    const plan = planRoad(w, 14.5, 15.5, 28.5, 15.5);
    expect(plan.why).toBeNull();
    expect(plan.cells.some((k) => w.isWet(k % N, Math.floor(k / N)))).toBe(false);
  });
});
