import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Underground, oreVeins, troopRoute, POOL_WATER, POOL_LAVA } from '../src/world/underground';
import { Expeditions, DIG_TIME } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS, choiceAt } from '../src/sim/missions';

const around = (k: number) => [k + 1, k - 1, k + N, k - N];

/** Le continent, un avant-poste bâti contre une grotte : sa garnison tient les premières galeries */
function outpost() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
  const u = new Underground(w);
  ex.under = u;
  let post: number[] | null = null;
  for (let z = 10; z < N - 10 && !post; z++) for (let x = 10; x < N - 10 && !post; x++) if (w.canPlace('outpost', x, z) === null) post = [x, z];
  w.place('outpost', post![0], post![1], 0, true, 2, false);
  ex.update(1.1);
  const news: [string, boolean][] = [];
  ex.onNews = (m, depths) => news.push([m, !!depths]);
  return { w, u, ex, news };
}

/** Une case de roche que l'on peut creuser, contre une galerie tenue (une vraie paroi, pas un pilier si mince qu'il s'efface) */
function rockByHeld(w: World, u: Underground) {
  for (const k of w.claimed) for (const n of around(k)) if (u.canCarve(n) && u.heightAt((n % N) + 0.5, Math.floor(n / N) + 0.5) > 1) return n;
  throw new Error('pas de roche contre les galeries tenues');
}

/** Les mineurs creusent toute leur file */
function digAll(ex: Expeditions) {
  for (let i = 0; i < 4000 && ex.digs().length; i++) ex.update(0.5);
}

/** Le village tient tout ce que l'on atteint depuis l'avant-poste, et en a abattu les filons */
function holdAll(w: World, u: Underground, ex: Expeditions) {
  const d = u.distances(ex.outposts().map((p) => p.entry));
  for (let k = 0; k < N * N; k++) if (d[k] >= 0) w.claimed.add(k);
  for (const v of oreVeins(u, w.mined)) if (d[v.k] >= 0) w.mined.add(v.k);
  return d;
}

describe('creuser des tunnels sous terre', () => {
  it('creuser ouvre la case : elle devient une galerie tenue, le relief se creuse, on en tire de la pierre', () => {
    const { w, u, ex } = outpost();
    expect(w.claimed.size).toBeGreaterThan(10);
    const k = rockByHeld(w, u), x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5;
    expect(u.open[k]).toBe(0);
    expect(u.heightAt(x, z)).toBeGreaterThan(1);
    // la case brute : la roche s'ouvre, les parois et le relief se refont autour
    const carved = u.carved, r = new Underground(w);
    r.sync();
    expect(r.dig(k)).not.toBeNull();
    expect(r.walkable(k % N, Math.floor(k / N))).toBe(true);
    expect(r.wallDist[k]).toBeGreaterThanOrEqual(1);
    expect(r.heightAt(x, z)).toBeLessThan(0.5);
    w.dug.delete(k);
    expect(u.carved).toBe(carved);
    // par les mineurs du camp : un clic sur la roche ; ils se rendent au chantier, puis quelques secondes de pioche
    const stone = w.stone;
    expect(ex.planDig(k)).toBe(true);
    expect(ex.digs()).toEqual([k]);
    ex.update(0.01);
    for (let i = 0; i < 200 && ex.digWalking(); i++) ex.update(0.25);
    expect(ex.digWalking()).toBe(false);
    expect(ex.digProgress()).toBe(0);
    ex.update(DIG_TIME / 2);
    expect(u.open[k]).toBe(0);
    expect(ex.digProgress()).toBeCloseTo(0.5, 1);
    ex.update(DIG_TIME / 2 + 0.01);
    expect(ex.digs()).toEqual([]);
    expect(u.walkable(k % N, Math.floor(k / N))).toBe(true);
    expect(u.heightAt(x, z)).toBeLessThan(0.5);
    expect(w.dug.has(k)).toBe(true);
    expect(w.claimed.has(k)).toBe(true);
    expect(w.stone).toBe(stone + 1);
    // on enchaîne : un clic au loin trace tout le tunnel jusque-là, un clic sur une case prévue l'annule avec la suite
    const far = u.tunnel([...w.claimed], (n) => n !== k && around(n).every((m) => !w.claimed.has(m)), 3)!;
    expect(far.length).toBeGreaterThanOrEqual(2);
    expect(ex.planDig(far[far.length - 1])).toBe(true);
    expect(ex.digs().length).toBe(far.length);
    expect(ex.planDig(ex.digs()[0])).toBe(false);
    expect(ex.digs()).toEqual([]);
    // ni hors de la carte, ni dans l'eau ou la lave, ni dans une galerie déjà tenue
    expect(ex.planDig(0)).toMatch(/bord de la carte/);
    const pool = [...Array(N * N).keys()].find((n) => u.pool[n] === POOL_WATER || u.pool[n] === POOL_LAVA)!;
    expect(ex.planDig(pool)).toMatch(/ni dans l’eau ni dans la lave/);
    expect(ex.planDig([...w.claimed][0])).toMatch(/galerie tenue/);
    expect(ex.digs()).toEqual([]);
  });

  it('un tunnel jusqu’à des galeries voisines les rend atteignables : l’expédition armée repart les prendre', () => {
    const { w, u, ex, news } = outpost();
    const before = holdAll(w, u, ex), deep = MISSIONS.find((m) => m.id === 'deep')!;
    const choice = choiceAt(deep.choices[deep.choices.findIndex((c) => c.troop === 'armor')], 2);
    // tout est pris : plus d'expédition armée, on propose de creuser
    expect(ex.campaign(choice)).toBeNull();
    expect(ex.why(deep, choice)).toMatch(/creusez un tunnel vers de nouvelles galeries/);
    expect(ex.tunnelNeeded()).toBe(true);
    // le passage conseillé : de la roche, de la galerie tenue jusqu'à des galeries hors d'atteinte
    const hint = ex.tunnelHint();
    expect(hint.length).toBeGreaterThan(0);
    expect(hint.every((k) => u.canCarve(k))).toBe(true);
    expect(around(hint[hint.length - 1]).some((n) => before[n] < 0 && u.walkable(n % N, Math.floor(n / N)))).toBe(true);
    // un clic sur la dernière marque : les mineurs creusent jusque-là
    expect(ex.planDig(hint[hint.length - 1])).toBe(true);
    const path = [...ex.digs()];
    expect(path.length).toBe(hint.length);
    digAll(ex);
    expect(ex.digs()).toEqual([]);
    expect(path.every((k) => w.dug.has(k) && w.claimed.has(k))).toBe(true);
    // le tunnel débouche : on l'annonce (un clic ouvre les Profondeurs), et l'expédition armée prend les nouvelles galeries
    expect(news).toContainEqual(['⛏️ Le tunnel débouche sur de nouvelles galeries : envoyez une expédition armée !', true]);
    expect(ex.tunnelNeeded()).toBe(false);
    expect(ex.why(deep, choice) ?? '').not.toMatch(/creusez/);
    const plan = ex.campaign(choice)!;
    expect(plan).not.toBeNull();
    expect(plan.take.length).toBeGreaterThan(0);
    expect(plan.take.every((k) => before[k] < 0)).toBe(true);
    // la troupe y va par le tunnel
    expect(troopRoute(u, plan.entry, plan.targets, plan.front).cells.some((k) => w.dug.has(k))).toBe(true);
  });

  it('percer la roche d’un filon l’abat toujours, même s’il lui reste une autre paroi ; un clic sur le filon y envoie les mineurs', () => {
    const { w, u, ex, news } = outpost();
    // deux filons à deux parois (au moins) : l'un creusé à la main, l'autre par un clic sur lui
    const two = oreVeins(u, w.mined).filter((v) => around(v.k).filter((n) => u.canCarve(n)).length >= 2 && u.walkable(v.k % N, Math.floor(v.k / N)));
    expect(two.length).toBeGreaterThan(1);
    const [a, b] = two;
    w.claimed.add(a.k); w.claimed.add(b.k);
    const rock = around(a.k).find((n) => u.canCarve(n))!, ore = w.ore;
    expect(ex.planDig(rock)).toBe(true);
    digAll(ex);
    expect(w.dug.has(rock)).toBe(true);
    expect(w.mined.has(a.k)).toBe(true);
    expect(w.ore).toBeGreaterThan(ore);
    expect(news.some(([m]) => /abattent un filon/.test(m))).toBe(true);
    // le clic sur le filon : la roche où il luit entre dans la file ; un second clic ne la double pas
    const wall = around(b.k).find((n) => u.canCarve(n))!;
    expect(ex.mineVein(b.k, wall)).toBe(true);
    expect(ex.digs()).toEqual([wall]);
    expect(ex.mineVein(b.k, wall)).toBe(true);
    expect(ex.digs()).toEqual([wall]);
    digAll(ex);
    expect(w.mined.has(b.k)).toBe(true);
    expect(oreVeins(u, w.mined).some((v) => v.k === b.k)).toBe(false);
  });

  it('la sauvegarde garde les tunnels creusés et la file des mineurs ; une ancienne sauvegarde n’en a pas', () => {
    const { w, u, ex } = outpost();
    const k = rockByHeld(w, u);
    ex.planDig(k);
    digAll(ex);
    const next = rockByHeld(w, u);
    ex.planDig(next);
    expect(w.dug.has(k)).toBe(true);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const load = (data: unknown) => {
      const w2 = new World();
      w2.mapId = w.mapId; w2.seed = w.seed;
      w2.fromJSON(data);
      w2.updateVis();
      const u2 = new Underground(w2);
      u2.sync();
      return { w2, u2 };
    };
    const { w2, u2 } = load(d);
    expect([...w2.dug]).toEqual([...w.dug]);
    expect(w2.digs).toEqual([next]);
    expect(w2.claimed.has(k)).toBe(true);
    // le souterrain rechargé est celui que les mineurs ont creusé : mêmes galeries, mêmes parois, même relief
    expect(u2.walkable(k % N, Math.floor(k / N))).toBe(true);
    expect(u2.open).toEqual(u.open);
    expect(u2.wallDist).toEqual(u.wallDist);
    let gap = 0;
    for (let i = 0; i < u.vis.length; i++) gap = Math.max(gap, Math.abs(u2.vis[i] - u.vis[i]));
    expect(gap).toBeLessThan(1e-5);
    // une sauvegarde d'avant le creusement : ni tunnel ni file
    delete d.dug; delete d.digs;
    const old = load(d);
    expect(old.w2.dug.size).toBe(0);
    expect(old.w2.digs).toEqual([]);
    expect(old.u2.open[k]).toBe(0);
  });
});
