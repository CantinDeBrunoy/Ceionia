import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world/world';
import { DEFAULT_BLASON, readBlason, randomBlason, COLOR_KEYS, EMBLEMS, SHAPES, BLASON_COLORS } from '../src/sim/blason';
import { team, TEAM_A, TEAM_B, TEAM_FLAG, TEAM_BANNER, TEAM_EMBLEM, teamColors, isTeam } from '../src/render/teamPaint';
import { Parts } from '../src/render/parts';

describe('blason du village', () => {
  it('relit un blason sauvé, et remplace par défaut ce qui manque ou ne se lit pas', () => {
    expect(readBlason(undefined)).toEqual(DEFAULT_BLASON);
    expect(readBlason({ a: 'vert', b: 'argent', e: 'tour', s: 'aronde' })).toEqual({ a: 'vert', b: 'argent', e: 'tour', s: 'aronde' });
    expect(readBlason({ a: 'turquoise', e: 'lion' })).toEqual(DEFAULT_BLASON);
    // deux fois la même teinte : l'emblème prend une autre couleur
    const same = readBlason({ a: 'or', b: 'or' });
    expect(same.a).toBe('or');
    expect(same.b).not.toBe('or');
  });

  it('les teintes ne reprennent ni le turquoise des Sablais ni la laque des Jadéens', () => {
    const vals = Object.values(BLASON_COLORS) as number[];
    expect(vals).not.toContain(0x2aa8a0);
    expect(vals).not.toContain(0xc0392e);
  });

  it('un tirage au hasard donne deux teintes différentes et des choix connus', () => {
    for (let i = 0; i < 50; i++) {
      const b = randomBlason();
      expect(b.a).not.toBe(b.b);
      expect(COLOR_KEYS).toContain(b.a);
      expect(EMBLEMS).toContain(b.e);
      expect(SHAPES).toContain(b.s);
    }
  });

  it('une ancienne partie prend le blason par défaut sans que la fenêtre ne s’ouvre ; une partie neuve le garde', () => {
    const w = new World();
    const d = w.toJSON() as Record<string, unknown>;
    expect(d.blason).toEqual(DEFAULT_BLASON);
    const old = { ...d };
    delete old.blason;
    const w2 = new World();
    w2.fromJSON(old);
    expect(w2.blason).toEqual(DEFAULT_BLASON);
    expect(w2.blasonSeen).toBe(true);
    w.blason = { a: 'pourpre', b: 'or', e: 'soleil', s: 'flamme' };
    const w3 = new World();
    w3.fromJSON(w.toJSON());
    expect(w3.blason).toEqual(w.blason);
    expect(w3.blasonSeen).toBe(false);
  });
});

describe('peinture du blason (sentinelles)', () => {
  it('les sentinelles sont négatives et gardent leur nuance', () => {
    for (const s of [TEAM_A, TEAM_B, TEAM_FLAG, TEAM_BANNER, TEAM_EMBLEM, team(TEAM_A, 0.8)]) expect(isTeam(s)).toBe(true);
    expect(team(TEAM_B, 0.75)).toBe(-2075);
  });

  it('les couleurs des sommets portent le code dans le bleu et la place sur la toile dans le rouge et le vert', () => {
    const pos = new THREE.BoxGeometry(0.2, 0.1, 0.01).translate(0.1, 0.05, 0).attributes.position as THREE.BufferAttribute;
    const arr = new Float32Array(pos.count * 3);
    teamColors(TEAM_FLAG, pos, arr);
    for (let i = 0; i < pos.count; i++) {
      expect(arr[i * 3 + 2]).toBeCloseTo(-16);
      // u de 0 (hampe) à 1, rapport 2:1 → 20 dixièmes dans la partie entière du vert
      expect(arr[i * 3]).toBeGreaterThanOrEqual(0);
      expect(arr[i * 3]).toBeLessThan(1);
      expect(Math.floor(arr[i * 3 + 1])).toBe(20);
    }
    teamColors(team(TEAM_A, 0.8), pos, arr);
    expect(arr[0]).toBeCloseTo(0.8);
    expect(arr[2]).toBeCloseTo(-1);
  });

  it('Parts garde les sentinelles à travers la fusion et l’occlusion factice', () => {
    const p = new Parts();
    p.box(0.2, 0.1, 0.01, 0, 0.05, 0, TEAM_BANNER);
    p.box(0.1, 0.1, 0.1, 0.5, 0, 0, 0x808080);
    const { body } = p.build(true);
    const col = body.attributes.color;
    let marked = 0;
    for (let i = 0; i < col.count; i++) if (col.getZ(i) < -32) marked++;
    expect(marked).toBe(36);
    for (let i = 0; i < col.count; i++) if (col.getZ(i) < 0) expect(-col.getZ(i)).toBeGreaterThan(64 * 0.7);
  });
});
