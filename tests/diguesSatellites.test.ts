import { describe, it, expect } from 'vitest';
import { World, N, VEG_FIELD } from '../src/world/world';
import type { Building, KindId } from '../src/build/catalog';
import { Calamities, CalamityHost } from '../src/calamities';

/**
 * Les savoir-faire des expéditions branchés sur les catastrophes naturelles : les digues et tranchées (« Le village sous le
 * volcan ») gardent champs et bâtiments au sec pendant une crue ; les satellites (« Premier vol de fusée ») l'annoncent trois
 * fois plus tôt
 */

/** Une rivière nord-sud en x = 40 … 43, des champs et une maison sur la berge basse (comme `catastrophes.test.ts`) */
function riverWorld() {
  const w = new World();
  w.difficulty = 'normal';
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) w.heights[w.vi(x, z)] = x >= 40 && x <= 43 ? -0.9 : (x >= 36 && x <= 47 ? 0.3 : 1);
  for (let z = 30; z < 50; z++) for (const x of [37, 38]) w.veg[z * N + x] = VEG_FIELD;
  const b: Building = { id: w.nextId++, kind: 'house' as KindId, x: 39, z: 40, rot: 0, auto: true, age: 2 };
  w.buildings.set(b.id, b);
  w.occ[40 * N + 39] = b.id;
  return w;
}

/** Un hôte de jeu réduit à ce que les catastrophes lisent ; les messages sont gardés */
function host(w: World) {
  const toasts: string[] = [];
  const env: any = { manualWeather: true, wantKind: 'rain', weatherKind: 'rain', rainK: 1, night: 0 };
  const noop = () => {};
  const h: CalamityHost = {
    world: w, env, time: { dayLen: 120, season: 1, hour: 12 } as any,
    audio: new Proxy({}, { get: () => noop }) as any,
    age: () => 2, toast: (m) => toasts.push(m), goTo: noop, lookUp: noop, shower: noop, ignite: noop, astronomers: () => false,
  };
  return { h, toasts };
}

/** Fait passer la crue de bout en bout ; rend sa durée (secondes de jeu) */
function runFlood(c: Calamities) {
  let t = 0;
  expect(c.start('flood', true)).toBe(true);
  while (c.busy && t < 600) { c.update(0.5, 0.5); t += 0.5; }
  return t;
}

describe('digues et satellites', () => {
  it('sans digues, la crue noie les champs de la berge ; avec, rien n’est noyé ni abîmé', () => {
    const w0 = riverWorld(), a = host(w0), c0 = new Calamities(a.h);
    runFlood(c0);
    expect(a.toasts.at(-1)).toMatch(/noyé/);

    const w1 = riverWorld(), b = host(w1), c1 = new Calamities(b.h);
    w1.exp.perks.push('dikes');
    runFlood(c1);
    expect(w1.damaged.size).toBe(0);
    expect(w1.veg.filter((v) => v === VEG_FIELD).length).toBe(40);
    expect(b.toasts.at(-1)).toMatch(/digues ont tenu/);
  });

  it('avec les satellites, la crue est annoncée par eux, et l’eau monte trois fois plus tard', () => {
    const w0 = riverWorld(), a = host(w0), c0 = new Calamities(a.h);
    const plain = runFlood(c0);
    const w1 = riverWorld(), b = host(w1), c1 = new Calamities(b.h);
    w1.exp.perks.push('satellites');
    const sat = runFlood(c1);
    expect(b.toasts[0]).toMatch(/satellites/);
    expect(a.toasts[0]).not.toMatch(/satellites/);
    expect(sat - plain).toBeGreaterThanOrEqual(39);
  });

  it('avec les satellites, le séisme est annoncé par eux', () => {
    const w = riverWorld(), a = host(w), c = new Calamities(a.h);
    w.exp.perks.push('satellites');
    expect(c.start('quake', true)).toBe(true);
    expect(a.toasts[0]).toMatch(/satellites/);
  });
});
