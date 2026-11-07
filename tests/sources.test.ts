import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionScene } from '../src/render/expeditionScenes';

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

describe('la source chaude', () => {
  it('sur plusieurs cartes, à la montagne comme à la rivière : le bassin n’est jamais enterré dans la pente, ni ne flotte', () => {
    stubCanvas();
    const mission = MISSIONS.find((m) => m.id === 'springs')!;
    let n = 0;
    for (const seed of [2026, 42, 77, 123]) for (const f of [0.2, 0.5, 0.8]) for (const ci of [0, 1]) {
      setMapSize(192);
      const w = new World();
      newWorld(w, 3, seed, GEN);
      w.updateVis();
      const spots: [number, number][] = [];
      for (let z = 10; z < N - 10; z += 3) for (let x = 10; x < N - 10; x += 3) if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < 3 && w.cellSlope(x, z) < 0.2 && [0, 2].every((d) => w.canPlace('house', x + d, z + d) === null)) spots.push([x, z]);
      const [x, z] = spots[Math.floor(spots.length * f)];
      for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 1, false);
      const agents = new Agents(w);
      for (let i = 0; i < 20; i++) agents.update(0.1, 10, 1, false, 40, 0);
      const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
      ex.pop = () => 60;
      const a = ex.start(mission, ci, 1);
      if (!a) continue;
      const scene = new ExpeditionScene(w, agents, new THREE.Group(), a, null);
      const s = scene as unknown as { bath: { y: number } | null; focus: [number, number] };
      expect(s.bath).not.toBeNull();
      // le dessus du bassin (son eau) ; le sol sous tout le bassin, pierres comprises
      const top = s.bath!.y + 0.07 - 0.024, [px, pz] = s.focus;
      let hi = -Infinity;
      for (const r of [0, 0.15, 0.3, 0.42]) for (let i = 0; i < 16; i++) {
        const h = w.surfaceAt(px + Math.cos(i * 0.39) * r, pz + Math.sin(i * 0.39) * r);
        hi = Math.max(hi, h);
        expect(h, `${seed} ${f} ${ci}`).toBeLessThanOrEqual(top + 0.002);
      }
      // ni perché au-dessus du sol (un socle comble l'écart du côté où le sol descend)
      expect(top - hi, `${seed} ${f} ${ci}`).toBeLessThan(0.03);
      // jamais dans l'eau
      expect(w.isWet(Math.floor(px), Math.floor(pz))).toBe(false);
      scene.dispose(a);
      n++;
    }
    expect(n).toBeGreaterThan(15);
  }, 120000);
});
