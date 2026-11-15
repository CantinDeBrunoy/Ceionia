import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { trophiesWon } from '../src/render/trophies';
import { TrophyCineQueue, cineCalm, CineScene, HOLD_MAX, TROPHY_CINE_DUR, trophyOfMission } from '../src/trophyCine';

/**
 * De bout en bout : une vraie chasse au mammouth part, réussit et revient ; le retour est branché comme dans `main.ts`
 * (`onReport` → `report(show)`, puis `update` à chaque image). La cinématique du trophée doit se jouer d'abord, le récit
 * ensuite. Non-régression : une notification encore à l'écran au retour (« l'équipe rentre… ») faisait passer le récit
 * d'abord, et la cinématique ne venait qu'après lui, ou jamais
 */

/** Un village de quelques maisons sur le continent de la graine 2026 */
function village() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
  ex.pop = () => 60;
  ex.missing = () => [];
  // (la chasse réussit à coup sûr)
  ex.chance = () => 0;
  return { w, agents, ex };
}

const calm: CineScene = { loading: false, away: false, placing: false, window: false, other: false, banner: false, notice: false };

/**
 * Joue la chasse au mammouth, puis quelques secondes ; `scene(t)` dit ce que montre le jeu à chaque instant (t : s
 * depuis le retour). Rend le journal : « récit », « cinématique », « fin »
 */
function hunt(scene: (t: number) => Partial<CineScene>, after = 15, already = false) {
  const v = village(), m = MISSIONS.find((x) => x.id === 'mammoth')!;
  // une partie qui a déjà son trophée du mammouth : la chasse se refait
  if (already) v.w.exp.done.push('mammoth');
  const q = new TrophyCineQueue(trophiesWon(v.w.exp));
  const log: string[] = [];
  let back = -1, t = 0;
  const now = () => ({ ...calm, ...(back < 0 ? {} : scene(t - back)) });
  // comme dans main.ts : la cinématique d'abord (le récit l'attend), sinon le récit tout de suite
  v.ex.onReport = (r) => {
    back = t;
    const show = () => log.push('récit');
    if (r.ok && q.detect(trophiesWon(v.w.exp), show, cineCalm(now(), false), r.redo ? trophyOfMission(r.m) : null)) return;
    show();
  };
  const a = v.ex.start(m, 1, 0);
  expect(a).toBeTruthy();
  const dt = 0.05;
  for (let i = 0; i < 60000 && (back < 0 || t - back < after); i++, t += dt) {
    v.agents.update(dt, 10, 0, false, 40, 0);
    v.ex.update(dt);
    if (a!.wait) v.ex.decide(a!, 0);
    // la boucle de TrophyStage.update
    if (!q.cur) q.detect(trophiesWon(v.w.exp));
    const r = q.update(dt, !q.cur && cineCalm(now(), true));
    r.release?.();
    if (r.end) { log.push('fin'); r.end.after?.(); }
    if (r.start) log.push('cinématique');
  }
  expect(back).toBeGreaterThan(0);
  expect(v.w.exp.done).toContain('mammoth');
  return log;
}

describe('cinématique du trophée au retour d’une expédition légendaire', () => {
  it('le trophée de chaque chasse légendaire', () => {
    expect(['mammoth', 'kraken', 'megalodon', 'dragon', 'games', 'wolf'].map((id) => trophyOfMission(MISSIONS.find((m) => m.id === id)!))).toEqual(['mammoth', 'kraken', 'megalodon', 'dragon', null, null]);
  });

  it('une chasse au mammouth refaite (le trophée déjà sur la place, une partie ancienne) : la cinématique se joue aussi, puis le récit', () => {
    expect(hunt(() => ({}), 15, true)).toEqual(['cinématique', 'fin', 'récit']);
  }, 60000);

  it('la chasse au mammouth réussie : la cinématique se joue, puis le récit', () => {
    expect(hunt(() => ({}))).toEqual(['cinématique', 'fin', 'récit']);
  }, 60000);

  it('une notification encore à l’écran au retour ne fait plus passer le récit d’abord', () => {
    expect(hunt((t) => ({ notice: t < 4 }))).toEqual(['cinématique', 'fin', 'récit']);
  }, 60000);

  it('une bannière qui passe : la cinématique attend qu’elle s’en aille, le récit l’attend', () => {
    expect(hunt((t) => ({ banner: t < 2 }))).toEqual(['cinématique', 'fin', 'récit']);
  }, 60000);

  it('une fenêtre ouverte juste après le retour : la cinématique est déjà partie', () => {
    expect(hunt((t) => ({ window: t > 0.1 && t < 3 }))).toEqual(['cinématique', 'fin', 'récit']);
  }, 60000);

  it('une bannière qui traîne : le récit ne l’attend pas plus de HOLD_MAX, la cinématique vient ensuite', () => {
    const log = hunt((t) => ({ banner: t < HOLD_MAX + 2 }), HOLD_MAX + 2 + 1 + TROPHY_CINE_DUR + 1);
    expect(log).toEqual(['récit', 'cinématique', 'fin']);
  }, 60000);

  it('en pleine pose de bâtiment au retour : le récit tout de suite, la cinématique quand l’outil est lâché', () => {
    const log = hunt((t) => ({ placing: t < 3 }), 3 + 1 + TROPHY_CINE_DUR + 1);
    expect(log).toEqual(['récit', 'cinématique', 'fin']);
  }, 60000);
});
