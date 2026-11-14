import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { EVENT_BY } from '../src/sim/events';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionScene } from '../src/render/expeditionScenes';

/**
 * L'épave qu'on fouille (« Une épave flotte » à la chasse au monstre, « Une coque à la dérive » au large) : elle reste là où
 * on l'a trouvée. Avant, elle était posée chaque image à côté du bateau, et le suivait quand il reprenait sa route
 */
function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

function village(age: number) {
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
  const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
  ex.pop = () => 60;
  ex.missing = () => [];
  return { w, agents, ex };
}

type Stage = { id: string; objs: THREE.Object3D[] };
type Boat = { obj: THREE.Object3D };

/** Joue la mission ; à l'arrivée, l'imprévu `ev` tombe, on choisit `pick` ; rend les positions de l'épave et du bateau ensuite */
function search(id: string, age: number, ev: string, pick: number) {
  stubCanvas();
  const v = village(age), m = MISSIONS.find((x) => x.id === id)!, a = v.ex.start(m, 0, age)!;
  const s = new ExpeditionScene(v.w, v.agents, new THREE.Group(), a, null), si = s as unknown as { stagings: Stage[]; boat: Boat | null };
  let raised = false, decided = -1;
  const wreck: THREE.Vector3[] = [], boat: THREE.Vector3[] = [];
  for (let i = 0; i < 80000 && a.phase !== 'home' && v.ex.active.includes(a); i++) {
    v.agents.update(0.05, 10, age, false, 40, 0);
    v.ex.update(0.05);
    // l'imprévu choisi, à la place de celui du tirage
    if (a.phase === 'work' && !raised) {
      raised = true;
      if (a.wait) v.ex.decide(a, a.wait.options.findIndex((_, j) => v.ex.canTake(a, j)));
      a.seen.push(ev); a.picks.push(-1); a.wait = EVENT_BY[ev];
    }
    s.update(0.05, a);
    if (a.wait?.id === ev && i > 0) { v.ex.decide(a, pick); decided = 0; continue; }
    else if (a.wait) v.ex.decide(a, a.wait.options.findIndex((_, j) => v.ex.canTake(a, j)));
    if (decided < 0) continue;
    const st = si.stagings.find((x) => x.id === ev);
    if (!st) break;
    wreck.push(st.objs[0].position.clone());
    boat.push(si.boat!.obj.position.clone());
  }
  return { wreck, boat };
}

const spread = (ps: THREE.Vector3[]) => Math.max(0, ...ps.map((p) => Math.hypot(p.x - ps[0].x, p.z - ps[0].z)));

describe('l’épave fouillée reste en place', () => {
  for (const [id, age, ev] of [['kraken', 1, 'wreck'], ['caravel', 2, 'derelict']] as const) {
    it(`${ev} (${id}) : fouillée, elle ne suit pas le bateau qui reprend sa route`, { timeout: 60000 }, () => {
      const { wreck, boat } = search(id, age, ev, 0);
      expect(wreck.length).toBeGreaterThan(20);
      // le bateau, lui, a bougé (sinon le test ne prouverait rien)
      expect(spread(boat)).toBeGreaterThan(0.4);
      // l'épave dérive à peine vers lui puis reste sur place
      expect(spread(wreck)).toBeLessThan(0.8);
    });
  }
});
