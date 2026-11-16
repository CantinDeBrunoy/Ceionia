import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { RivalBattle, GOALS, BattleGoal, BattleNews, Tactic1, Tactic2, OURS, ALLY_FIRST, FOE_TOTAL, FOES, BATTLE_LIMIT } from '../src/sim/rivalBattle';
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
/**
 * Joue la bataille sans ordre du joueur : les troupes marchent d'elles-mêmes sur l'objectif en cours ; les choix tactiques
 * sont pris par défaut (`tactics` absent) ou imposés. Garde toutes les nouvelles, datées
 */
function play(b: RivalBattle, tactics?: [Tactic1, Tactic2]) {
  const log: (BattleNews & { t: number })[] = [];
  for (let t = 0; t < BATTLE_LIMIT + 10 && !b.outcome; t += 0.25) {
    if (b.waiting && tactics) b.choose(tactics[b.waiting - 1]);
    b.step(0.25);
    for (const n of b.news.splice(0)) log.push({ ...n, t: b.t });
  }
  return log;
}
const at = (log: (BattleNews & { t: number })[], type: BattleNews['type'], goal?: BattleGoal) =>
  log.find((n) => n.type === type && (!goal || (n.type === 'goal' && n.goal === goal)))?.t ?? Infinity;

describe('la bataille de l’archipel (voie de la guerre) : façon gouffre de Helm', () => {
  afterAll(() => setMapSize(192));

  // une bataille de référence, au Médiéval, sans ordre : chaque phase est vérifiée sur elle
  let ref: RivalBattle, log: (BattleNews & { t: number })[];
  const reference = () => {
    if (!ref) { ref = new RivalBattle(archipel(11), 'asie', 2); log = play(ref); }
    return { b: ref, log };
  };

  it('les forces : 25 des nôtres (en trois barques), 25 alliés (en deux temps), 45 ennemis avec les renforts et le chef', () => {
    const b = new RivalBattle(archipel(11), 'orient', 2);
    expect(OURS[0] + OURS[1]).toBe(25);
    expect(FOE_TOTAL).toBe(45);
    expect(b.troops().length).toBeLessThan(25);
    expect(b.allied().length).toBe(0);
    expect(b.current).toBe('plage');
    for (const g of GOALS) expect(b.defenders(g).length).toBeGreaterThan(0);
    expect(b.gate).not.toBeNull();
  });

  it('phase 1, la plage : les barques accostent une à une, la première vague de l’allié débarque, une contre-attaque sort de la ville, la plage tombe', () => {
    const { log } = reference();
    expect(log.filter((n) => n.type === 'boat').length).toBe(2);
    expect(at(log, 'allyLands')).toBeLessThan(at(log, 'goal', 'plage') + 60);
    expect(at(log, 'counter')).toBeLessThan(Infinity);
    expect(at(log, 'goal', 'plage')).toBeLessThan(at(log, 'goal', 'port'));
    const first = log.find((n) => n.type === 'choice');
    expect(first).toMatchObject({ type: 'choice', step: 1 });
    expect(first!.t).toBeGreaterThanOrEqual(at(log, 'goal', 'plage'));
  });

  it('phase 2, les remparts : la porte tient puis cède ; les vagues de renfort et le gros de l’allié arrivent au moment de bascule', () => {
    const { log } = reference();
    expect(at(log, 'goal', 'port')).toBeLessThan(at(log, 'goal', 'remparts'));
    expect(at(log, 'gate')).toBeLessThan(at(log, 'goal', 'remparts'));
    expect(log.filter((n) => n.type === 'wave').length).toBeGreaterThan(0);
    expect(at(log, 'relief')).toBeLessThan(at(log, 'goal', 'palais'));
    const second = log.filter((n) => n.type === 'choice')[1];
    expect(second).toMatchObject({ type: 'choice', step: 2 });
    expect(second.t).toBeGreaterThanOrEqual(at(log, 'goal', 'remparts'));
  });

  it('phase 3, le palais : le chef pousse son cri, tombe (sa garde, s’il en reste, se rend), la ville est prise', () => {
    const { b, log } = reference();
    expect(at(log, 'cry')).toBeLessThan(at(log, 'end'));
    expect(b.sim.units.get(b.chief)?.hp ?? 0).toBeLessThanOrEqual(0);
    if (at(log, 'surrender') < Infinity) expect(at(log, 'surrender')).toBeLessThanOrEqual(at(log, 'end'));
    expect(log.filter((n) => n.type === 'goal').map((n) => (n as { goal: BattleGoal }).goal)).toEqual(GOALS);
    expect(b.outcome).toBe('won');
    expect(b.current).toBeNull();
    // une bataille épique, pas une promenade : des minutes de combat, des pertes pour le spectacle
    expect(b.t).toBeGreaterThan(150);
    expect(b.troops().length).toBeLessThan(25);
  });

  for (const age of [1, 2, 3, 4, 5]) {
    it(`âge ${age} : gagnée sans aucun ordre, par les deux peuples`, () => {
      for (const people of ['orient', 'asie'] as const) {
        const b = new RivalBattle(archipel(4242), people, age);
        play(b);
        expect(b.outcome).toBe('won');
        expect(b.troops().length).toBeGreaterThan(3);
      }
    });
  }

  it('chaque choix tactique mène à la victoire (au Médiéval)', () => {
    for (const t of [['ram', 'charge'], ['climb', 'regroup'], ['bombard', 'allyLead']] as [Tactic1, Tactic2][]) {
      const b = new RivalBattle(archipel(11), 'orient', 2), log = play(b, t);
      expect(b.outcome).toBe('won');
      if (t[0] === 'climb') expect(at(log, 'breach')).toBeLessThan(Infinity);
      if (t[0] === 'bombard') expect(at(log, 'bombard')).toBeLessThan(Infinity);
    }
  });

  it('les éclaireurs aident : la plage moins gardée, la porte affaiblie, le chef moins solide', () => {
    const w = archipel(11), plain = new RivalBattle(w, 'asie', 2), told = new RivalBattle(w, 'asie', 2, false, undefined, ['scoutBeach', 'scoutGate', 'scoutChief']);
    expect(told.defenders('plage').length).toBeLessThan(plain.defenders('plage').length);
    expect(told.gate!.hp).toBeLessThan(plain.gate!.hp);
    const hp = (b: RivalBattle) => b.sim.units.get(b.chief)!.hp;
    expect(hp(told)).toBeLessThan(hp(plain));
    expect(FOES.plage[0]).toBeGreaterThan(2);
  });

  it('une armée trop petite, sans allié pour la relever, est repoussée', () => {
    const b = new RivalBattle(archipel(4242), 'orient', 2, false, ['archer', 'archer']);
    // (les alliés aussi tombent : on les retire pour voir la défaite)
    b.step(0.25);
    for (let t = 0; t < BATTLE_LIMIT && !b.outcome; t += 0.25) { for (const u of b.allied()) b.sim.damage(u, 1e6); b.step(0.25); }
    expect(b.outcome).toBe('lost');
    expect(ALLY_FIRST[0]).toBeGreaterThan(0);
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
