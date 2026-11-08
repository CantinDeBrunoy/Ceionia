import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { Sentinels, SENTINEL_MAX, CHAIN_MIN, CHAIN_LONG } from '../src/sim/sentinels';
import { WALK } from '../src/render/ramparts';
import { patrolRole } from '../src/sim/patrols';

/**
 * Les sentinelles des remparts : une ou deux par chaîne de murs reliés, une par tour de garde, douze au plus, toujours sur le
 * dessus des murs (à la hauteur du chemin de ronde de l'âge), jamais dans une tour
 */

const setup = () => {
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.exp.done.push('portal');
  const [sx, sz] = w.startSpot();
  for (let z = sz - 8; z <= sz + 10; z++) for (let x = sx - 8; x <= sx + 10; x++) w.heights[z * (N + 1) + x] = 1.5;
  for (let z = sz - 8; z < sz + 10; z++) for (let x = sx - 8; x < sx + 10; x++) w.veg[w.ci(x, z)] = 0;
  const P = (k: 'wall' | 'gate' | 'watchtower', x: number, z: number, age = 2) => { expect(w.canPlace(k, x, z), `${k} ${x},${z}`).toBeNull(); return w.place(k, x, z, 0, false, age, false); };
  return { w, sx, sz, P };
};
const run = (s: Sentinels, t: number, age = 2) => { for (let i = 0; i < t * 20; i++) s.update(0.05, age); };

describe('sentinelles des remparts', () => {
  beforeAll(() => setMapSize(192));

  it('les chaînes : pans, portes et tours reliés par les côtés ; une sentinelle dès trois cases, deux dès huit, une par tour, douze au plus', () => {
    const { w, sx, sz, P } = setup();
    const s = new Sentinels(w);
    run(s, 0.1);
    expect(s.sentinels).toEqual([]);
    // deux pans : rien ; trois : une marcheuse
    P('wall', sx, sz); P('wall', sx + 1, sz);
    run(s, 0.1);
    expect(s.sentinels.length).toBe(0);
    P('wall', sx + 2, sz);
    run(s, 0.1);
    expect(Sentinels.chains(w)[0].cells.length).toBe(CHAIN_MIN);
    expect(s.sentinels.length).toBe(1);
    // une rue nord-sud avec sa porte, puis le mur continue : huit cases, deux marcheuses ; une tour au bout : une factionnaire
    for (let z = sz - 3; z <= sz + 3; z++) w.setRoad(sx + 3, z, true);
    P('gate', sx + 3, sz);
    for (let x = sx + 4; x <= sx + 6; x++) P('wall', x, sz);
    P('watchtower', sx + 7, sz);
    run(s, 0.1);
    const [ch] = Sentinels.chains(w);
    expect(ch.cells.length).toBe(CHAIN_LONG);
    expect(ch.towers.length).toBe(1);
    expect(s.sentinels.filter((x) => x.tower < 0).length).toBe(2);
    expect(s.sentinels.filter((x) => x.tower >= 0).length).toBe(1);
    // la tour démolie : sa factionnaire s'en va, les marcheuses restent
    w.removeBuilding(w.buildingAt(sx + 7, sz)!.id);
    run(s, 0.1);
    expect(s.sentinels.length).toBe(2);
    // beaucoup de tours isolées et de murs : jamais plus de douze
    for (let i = 0; i < 8; i++) { P('watchtower', sx - 6 + i * 2, sz + 4); }
    for (let z = sz + 6; z <= sz + 9; z++) for (const x of [sx - 6, sx - 2, sx + 2, sx + 6]) P('wall', x, z);
    run(s, 0.1);
    expect(s.sentinels.length).toBeLessThanOrEqual(SENTINEL_MAX);
    expect(s.sentinels.length).toBe(SENTINEL_MAX);
  });

  it('elles marchent sur le dessus du mur, à la hauteur du chemin de ronde de l’âge, passent la porte sur son linteau et n’entrent jamais dans la tour', () => {
    const { w, sx, sz, P } = setup();
    for (let x = sx; x <= sx + 8; x++) if (x !== sx + 4) P('wall', x, sz, 3);
    for (let z = sz - 3; z <= sz + 3; z++) w.setRoad(sx + 4, z, true);
    P('gate', sx + 4, sz, 3);
    P('watchtower', sx + 9, sz, 3);
    const s = new Sentinels(w);
    run(s, 0.1, 3);
    const walkers = s.sentinels.filter((x) => x.tower < 0);
    expect(walkers.length).toBe(2);
    const wk = WALK[3], base = w.cellAvg(sx, sz);
    let onGate = 0, moved = 0;
    for (let i = 0; i < 20 * 120; i++) {
      s.update(0.05, 3);
      for (const m of walkers) {
        const cx = Math.floor(m.x), cz = Math.floor(m.z + 0.2), b = w.buildingAt(cx, cz) ?? w.buildingAt(Math.round(m.x - 0.5), Math.round(m.z - 0.5));
        expect(b, `hors du mur en ${m.x.toFixed(2)}, ${m.z.toFixed(2)}`).toBeDefined();
        expect(b!.kind).not.toBe('watchtower');
        expect(m.y).toBeGreaterThanOrEqual(base + wk.y - 0.01);
        expect(m.y).toBeLessThanOrEqual(base + wk.gate + 0.01);
        if (b!.kind === 'gate' && Math.abs(m.x - cx - 0.5) < 0.1) { onGate++; expect(m.y).toBeGreaterThan(base + wk.gate - 0.12); }
        if (m.mode === 'walk') moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(onGate).toBeGreaterThan(0);
    // la factionnaire de la tour est sur sa plate-forme
    const guard = s.sentinels.find((x) => x.tower >= 0)!;
    expect(guard).toBeDefined();
    expect(guard.y).toBeCloseTo(w.cellAvg(sx + 9, sz) + wk.tower[1], 2);
    expect(Math.hypot(guard.x - (sx + 9.5), guard.z - (sz + 0.5))).toBeLessThan(0.45);
    expect(s.all().every((m) => m.y !== undefined)).toBe(true);
  });

  it('la tenue est celle de l’âge, comme les patrouilles des rues', () => {
    expect(patrolRole(1)).toBe('spearman');
    expect(patrolRole(3)).toBe('soldier');
  });
});
