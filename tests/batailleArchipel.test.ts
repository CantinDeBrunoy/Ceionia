import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { RivalBattle, GOALS, BattleGoal } from '../src/sim/rivalBattle';
import { newDiplo, chooseAlly, choosePath, applyDiplo, battleReady, loseAllyBattle, claimVictory, WAR_SPOILS, RETRY_DAYS } from '../src/sim/diplomacy';

/** L'archipel d'une graine (carte de 384) */
const cache = new Map<number, World>();
function archipel(seed: number) {
  if (!cache.has(seed)) {
    setMapSize(384);
    const w = new World();
    w.seed = seed;
    newWorld(w, CONTINENT, seed, GEN_ARCH);
    cache.set(seed, w);
  }
  return cache.get(seed)!;
}
/** Joue la bataille sans ordre du joueur (les troupes marchent d'elles-mêmes sur l'objectif en cours) */
function play(b: RivalBattle, limit = 1200) {
  for (let t = 0; t < limit && !b.outcome; t += 0.25) b.step(0.25);
  return b.outcome;
}

describe('la bataille de l’archipel (voie de la guerre)', () => {
  afterAll(() => setMapSize(192));

  it('l’armée débarquée prend la ville objectif après objectif : la plage, les remparts, le port, le palais', () => {
    for (const people of ['orient', 'asie'] as const) {
      const b = new RivalBattle(archipel(11), people, 2);
      expect(b.current).toBe('plage');
      expect(b.troops().length).toBe(12);
      for (const g of GOALS) expect(b.defenders(g).length).toBeGreaterThan(0);
      expect(play(b)).toBe('won');
      const taken = b.news.filter((n): n is { type: 'goal'; goal: BattleGoal; next: BattleGoal | null } => n.type === 'goal').map((n) => n.goal);
      expect(taken).toEqual(GOALS);
      expect(b.current).toBeNull();
      // une vraie bataille : des pertes, pas une promenade
      expect(b.troops().length).toBeLessThan(12);
    }
  });

  it('les remparts ne se franchissent que par leurs portes', () => {
    const b = new RivalBattle(archipel(11), 'asie', 2), plan = b.map.plan;
    const side = plan.gates.findIndex((g) => g === null), gate = plan.gates.findIndex((g) => g !== null);
    const mid = (i: number): [number, number] => { const a = plan.wall[i], c = plan.wall[(i + 1) % plan.wall.length]; return b.map.local([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]); };
    const [sx, sz] = mid(side), [gx, gz] = mid(gate);
    expect(b.map.block[b.map.cell(sx, sz)]).toBe(1);
    expect(b.map.block[b.map.cell(gx, gz)]).toBe(0);
  });

  it('une armée trop petite est repoussée', () => {
    const b = new RivalBattle(archipel(4242), 'orient', 2, false, ['archer', 'archer']);
    expect(play(b)).toBe('lost');
    expect(b.troops().length).toBe(0);
  });

  it('la défaite : retraite, puis un nouvel essai après le délai ; la victoire règle le conflit et verse le butin', () => {
    const w = { diplo: newDiplo(), gold: 0 };
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'war');
    expect(battleReady(w.diplo, 0)).toBe(false);
    applyDiplo(w.diplo, 'landing');
    expect(w.diplo.battle).toBe('ready');
    expect(battleReady(w.diplo, 0)).toBe(true);
    // (la bataille engagée, on ne change plus de voie)
    expect(choosePath(w.diplo, 'peace')).toBe(false);
    expect(loseAllyBattle(w.diplo, 100, 130)).toBe(true);
    expect(battleReady(w.diplo, 100 + RETRY_DAYS * 130 - 1)).toBe(false);
    expect(battleReady(w.diplo, 100 + RETRY_DAYS * 130)).toBe(true);
    expect(claimVictory(w)).toBe(true);
    expect(w.diplo.conflict).toBe('won');
    expect(w.diplo.battle).toBe('none');
    expect(w.gold).toBe(WAR_SPOILS.loot);
    expect(claimVictory(w)).toBe(false);
    expect(w.gold).toBe(WAR_SPOILS.loot);
  });
});
