import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, isLegendary, effectSummary } from '../src/sim/missions';
import { Expeditions, ActiveExpedition, FATED, FATE_AT } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionScene } from '../src/render/expeditionScenes';
import { beastInfo } from '../src/render/beasts';
import { TROPHIES, trophiesWon, trophyParts } from '../src/render/trophies';
import { CINE_TROPHIES } from '../src/trophyCine';
import { Parts } from '../src/render/parts';

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** Un village de quelques maisons sur le continent de la graine 2026, ses habitants dehors */
function village(age: number, seed = 7) {
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
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

type Stag = { m: { b: { obj: THREE.Object3D; x: number; z: number }; lie: number }; halo: THREE.Object3D; way: string };
const stagOf = (s: ExpeditionScene) => (s as unknown as { stagH: Stag | null }).stagH!;

/** La scène jouée jusqu'au départ de l'équipe, l'issue forcée (`fate`) ; `each` à chaque image du travail */
function stage(v: ReturnType<typeof village>, a: ActiveExpedition, fate: boolean, each: (s: ExpeditionScene, k: number) => void) {
  stubCanvas();
  const s = new ExpeditionScene(v.w, v.agents, new THREE.Group(), a, null);
  for (let i = 0; i < 80000 && a.phase !== 'back'; i++) {
    v.agents.update(0.05, 10, a.age, false, 40, 0);
    v.ex.update(0.05);
    if (a.wait) v.ex.decide(a, 0);
    if (a.fate !== undefined) a.fate = fate;
    s.update(0.05, a);
    if (a.phase === 'work') each(s, a.t / Math.max(1, a.c.work + a.extra));
  }
  return s;
}

describe('la chasse au cerf blanc', () => {
  it('une chasse légendaire du Moyen Âge, facultative, dans la forêt : la meute ou l’affût', () => {
    const m = mission('stag');
    expect([m.age, m.mandatory, isLegendary(m)]).toEqual([2, false, true]);
    expect(m.choices.map((c) => [c.dest, c.scene, c.variant ?? null])).toEqual([['forest', 'stag', null], ['forest', 'stag', 'stalk']]);
    for (const c of m.choices) expect(c.win.some((e) => e.t === 'perk' && e.id === 'stag')).toBe(true);
    expect(effectSummary(m.choices[0].win)).toContain('les bois du cerf blanc');
    // l'issue se tire aux quatre cinquièmes du travail, pour qu'on voie le cerf pris ou enfui
    expect(FATED.has('stag')).toBe(true);
  });

  it('ses bois rejoignent la place : trophée, et sa cinématique', () => {
    expect(TROPHIES).toContain('stag');
    expect(trophiesWon({ done: ['stag'], perks: [] })).toEqual(['stag']);
    expect(trophiesWon({ done: [], perks: ['stag'] })).toEqual(['stag']);
    expect(CINE_TROPHIES).toContain('stag');
    // des bois dorés plus hauts que la tête, sur l'écusson
    const p = new Parts();
    trophyParts(p, 'stag', 2);
    const g = p.build().body;
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.55);
  });

  it('le cerf blanc est une bête articulée qui marche, bondit, broute, brame et se couche', () => {
    const { bones, clips } = beastInfo('whitestag');
    for (const b of ['head', 'neck', 'jaw', 'fL1', 'fR2', 'hL1', 'hR2']) expect(bones).toContain(b);
    for (const c of ['Walk', 'Gallop', 'Idle', 'Idle_2', 'Eating', 'Sleep']) expect(clips).toContain(c);
  });

  it('pris, il se couche dans la clairière, son halo s’éteint ; on l’a vu courir devant la meute', () => {
    const v = village(2), a = v.ex.start(mission('stag'), 0, 2)!;
    let ran = 0, lay = -1;
    const s = stage(v, a, true, (sc, k) => {
      const h = stagOf(sc);
      if (k > 0.35 && k < 0.75) ran = Math.max(ran, Math.hypot(h.m.b.x - a.dest[0], h.m.b.z - a.dest[1]));
      if (lay < 0 && h.m.lie > 0.5) lay = k;
    });
    const h = stagOf(s);
    expect(h.way).toBe('chase');
    expect(ran).toBeGreaterThan(1);
    expect(lay).toBeGreaterThan(FATE_AT - 0.01);
    expect(h.halo.visible).toBe(false);
    s.dispose(a);
  });

  it('manqué à l’affût, il s’enfuit loin du camp', () => {
    const v = village(2, 5), a = v.ex.start(mission('stag'), 1, 2)!;
    let at = 0;
    const s = stage(v, a, false, (sc, k) => { const h = stagOf(sc); if (k < FATE_AT) at = Math.hypot(h.m.b.x - a.dest[0], h.m.b.z - a.dest[1]); });
    const h = stagOf(s);
    expect(h.way).toBe('stalk');
    expect(Math.hypot(h.m.b.x - a.dest[0], h.m.b.z - a.dest[1]) - at).toBeGreaterThan(1);
    expect(h.m.lie).toBe(0);
    s.dispose(a);
  });
});
