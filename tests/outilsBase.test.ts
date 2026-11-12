import { describe, it, expect } from 'vitest';
import { HellMap } from '../src/world/hell';
import { Hell, HellBuilding } from '../src/sim/hell';
import { HellBase, BASE_DEFS, Purse } from '../src/sim/hellBase';
import { escapeAction, troopRole } from '../src/ui/command';
import { TROOP_KINDS } from '../src/sim/army';

/** Les outils de la base des Enfers (déplacer, démolir) et ce que la barre du bas en montre */

const rich = (): Purse => ({ wood: 9999, stone: 9999, ore: 9999 });
const spot = (b: HellBase, kind: keyof typeof BASE_DEFS, x: number, z: number) => {
  for (let r = 0; r < 9; r += 0.5)
    for (let a = 0; a < 16; a++) {
      const px = x + Math.sin(a * 0.39) * r, pz = z + Math.cos(a * 0.39) * r;
      if (b.canBuild(kind, px, pz, rich()) === null) return [px, pz] as [number, number];
    }
  throw new Error(`pas de place pour ${kind}`);
};
const setup = () => {
  const m = new HellMap(1), h = new Hell(m, 1), b = new HellBase(h, m);
  const [ax, az] = m.arrival;
  const camp = b.build('camp', ...spot(b, 'camp', ax, az + 3), rich()) as HellBuilding;
  return { m, h, b, camp };
};

describe('les outils de la base des Enfers', () => {
  it('démolir : le bâtiment s’en va, sa place se libère, rien n’est rendu ; le camp reste', () => {
    const { m, b, camp } = setup();
    const p = rich();
    const tower = b.build('tower', ...spot(b, 'tower', camp.site.x + 3, camp.site.z + 2), p) as HellBuilding;
    const wood = p.wood;
    expect(b.at(tower.site.x + 0.2, tower.site.z)).toBe(tower);
    expect(m.walkableAt(tower.site.x, tower.site.z)).toBe(false);
    expect(b.demolish(tower)).toBeNull();
    expect(b.countOf('tower')).toBe(0);
    expect(m.walkableAt(tower.site.x, tower.site.z)).toBe(true);
    expect(p.wood).toBe(wood);
    expect(b.demolish(camp)).toMatch(/camp/);
    expect(b.countOf('camp')).toBe(1);
  });

  it('déplacer : gratuit, la vie est gardée, l’ancienne place se libère ; une place interdite est refusée sans rien changer', () => {
    const { m, b, camp } = setup();
    const post = b.build('post', ...spot(b, 'post', camp.site.x + 3, camp.site.z), rich()) as HellBuilding;
    post.hp = Math.round(post.maxHp / 2);
    const [x0, z0] = [post.site.x, post.site.z];
    // (une autre place libre, à l'écart de l'ancienne)
    let to: [number, number] | null = null;
    for (const [dx, dz] of [[-4, 0], [0, 4], [0, -4], [4, 4], [-4, 4]]) {
      const x = camp.site.x + dx, z = camp.site.z + dz;
      if (Math.hypot(x - x0, z - z0) > 2.5 && b.relocateWhy(post, x, z) === null) { to = [x, z]; break; }
    }
    expect(to).not.toBeNull();
    // trop loin du camp : refusé, rien ne bouge
    expect(b.relocate(post, camp.site.x + 40, camp.site.z)).not.toBeNull();
    expect(b.at(x0, z0)).toBe(post);
    expect(m.walkableAt(x0, z0)).toBe(false);
    expect(b.relocate(post, to![0], to![1])).toBeNull();
    const moved = b.at(to![0], to![1])!;
    expect(moved.kind).toBe('post');
    expect(moved.hp).toBe(post.hp);
    expect(b.countOf('post')).toBe(1);
    expect(m.walkableAt(x0, z0)).toBe(true);
    expect(b.relocateWhy(camp, camp.site.x + 2, camp.site.z)).toMatch(/camp/);
  });

  it('Échap lâche d’abord l’outil (pas de sortie des Enfers, pas de désélection)', () => {
    expect(escapeAction({ kind: 'hell', placing: false, trace: false, armed: false, selected: 3, tool: true })).toBe('stopTool');
    expect(escapeAction({ kind: 'hell', placing: true, trace: false, armed: false, selected: 0, tool: true })).toBe('stopPlacing');
    expect(escapeAction({ kind: 'hell', placing: false, trace: false, armed: false, selected: 0 })).toBe('hint');
  });

  it('chaque troupe a un rôle court à chaque âge', () => {
    for (const k of TROOP_KINDS) for (let a = 1; a <= 5; a++) {
      const r = troopRole(k, a);
      expect(r.text.length, `${k} ${a}`).toBeGreaterThan(3);
      expect(r.text.length).toBeLessThan(26);
    }
  });
});
