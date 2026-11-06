import { describe, it, expect } from 'vitest';
import { BEAST_KINDS, beastInfo, makeBeast, BeastKind } from '../src/render/beasts';

describe('bêtes articulées', () => {
  const kinds = [...BEAST_KINDS] as BeastKind[];

  it('chaque bête marche, court, se repose et dort', () => {
    for (const k of kinds) {
      const { clips } = beastInfo(k);
      for (const n of ['Walk', 'Gallop', 'Idle']) expect(clips, `${k} : ${n}`).toContain(n);
    }
  });

  it('chaque bête a une tête et des pattes en deux segments', () => {
    for (const k of kinds) {
      const { bones } = beastInfo(k);
      expect(bones, k).toContain('head');
      const legs = bones.filter((b) => /1$/.test(b) && bones.includes(b.replace(/1$/, '2')));
      expect(legs.length, k).toBeGreaterThanOrEqual(4);
    }
  });

  it('le loup est une bête articulée : oreilles, queue en deux os, hurlement et flairage, trois robes', () => {
    expect(BEAST_KINDS.has('wolf')).toBe(true);
    const { bones, clips } = beastInfo('wolf');
    for (const b of ['eL', 'eR', 'jaw', 'tail1', 'tail2']) expect(bones).toContain(b);
    // (morsure et sursaut : pour la chasse au loup des expéditions)
    for (const n of ['Sleep', 'Eating', 'Idle_2', 'Idle_3', 'Attack', 'Hit']) expect(clips).toContain(n);
    for (const coat of [0, 1, 2]) expect(makeBeast('wolf', coat, 1).actions.has('Idle_2')).toBe(true);
  });

  it('chaque bête se clone avec son squelette et ses animations', { timeout: 30000 }, () => {
    for (const k of kinds) {
      const info = beastInfo(k), a = makeBeast(k, 0, 1);
      let bones = 0, skinned = 0;
      a.root.traverse((o) => { if ((o as any).isBone) bones++; if ((o as any).isSkinnedMesh) skinned++; });
      expect(skinned, k).toBe(1);
      expect(bones, k).toBe(info.bones.length);
      expect(a.actions.size, k).toBe(info.clips.length);
      // chaque piste vise un os existant
      for (const act of a.actions.values()) for (const t of act.getClip().tracks) expect(info.bones, k).toContain(t.name.split('.')[0]);
    }
  });
});
