import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { RivalBattle, GOALS, BattleGoal, BattleNews, Tactic1, Tactic2, OURS, ALLY_FIRST, FOE_TOTAL, FOES, BATTLE_LIMIT, EPIC_CAP, SCHEMES, SIEGE_T, ARMOR_TANKS, type EpicOpts } from '../src/sim/rivalBattle';
import { corpsTroops } from '../src/sim/campaign';
import { GARRISON_MEN } from '../src/sim/concession';
import type { Boons } from '../src/sim/diplomacy';
import { newDiplo, readDiplo, chooseAlly, choosePath, applyDiplo, battleReady, loseAllyBattle, claimVictory, chooseVictors, tributePerDay, rivalTownState, WAR_SPOILS, RETRY_DAYS, VICTORS_TRIBUTE, REBUILD_GOLD, RUIN_DAYS } from '../src/sim/diplomacy';

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

/**
 * La bataille des deux îles (chantier D du nouveau monde) : le plan, la mer (son issue), le passage et les remparts avec
 * leurs casemates et le choix tactique, le palais. Gagnable sans ordre avec chaque plan, la mer gagnée ou perdue, au plus
 * `EPIC_CAP` unités vivantes à la fois
 */
describe('la bataille des deux îles (Moderne)', () => {
  // (la carte de 384 : le bloc d'avant l'a remise à 192 en sortant)
  beforeAll(() => setMapSize(384));
  afterAll(() => setMapSize(192));
  /** Le corps du Moderne, la ville de garnison bâtie (35 + 8 hommes) */
  const corps = () => corpsTroops(newDiplo(), 4, GARRISON_MEN);
  const epic = (seed: number, rival: 'orient' | 'asie', epic: EpicOpts, boons?: Boons) =>
    new RivalBattle(archipel(seed), rival, 4, false, corps(), [], boons, { kind: 'epic', held: ['plage', 'port', 'tour'], epic });
  /** Joue sans ordre ; garde les nouvelles, et le plus d'unités vivantes à la fois */
  const run = (b: RivalBattle) => {
    const log: (BattleNews & { t: number })[] = [];
    let max = 0;
    for (let t = 0; t < BATTLE_LIMIT + 10 && !b.outcome; t += 0.25) { b.step(0.25); max = Math.max(max, b.living()); for (const n of b.news.splice(0)) log.push({ ...n, t: b.t }); }
    return { log, max };
  };

  it('ses temps dans l’ordre : le passage, le choix des remparts, les casemates, les remparts, le palais ; gagnée sans ordre, sous 90 unités vivantes', () => {
    const b = epic(11, 'asie', { scheme: 'force', sea: 'won', air: true, battery: true });
    expect(b.plan).toEqual(['passage', 'remparts', 'palais']);
    expect(b.casemates.length).toBe(2);
    expect(b.living()).toBeLessThanOrEqual(EPIC_CAP);
    const { log, max } = run(b);
    expect(b.outcome).toBe('won');
    expect(max).toBeLessThanOrEqual(EPIC_CAP);
    const goal = (g: BattleGoal) => log.find((n) => n.type === 'goal' && n.goal === g)!.t;
    expect(goal('passage')).toBeLessThan(goal('remparts'));
    expect(goal('remparts')).toBeLessThan(goal('palais'));
    // (le passage pris, la carte des remparts ; sans ordre, l'appui aérien, le premier choix possible)
    expect(log.find((n) => n.type === 'choice')).toMatchObject({ step: 3 });
    expect(b.tactic3).toBe('air');
    expect(log.some((n) => n.type === 'air')).toBe(true);
    expect(log.some((n) => n.type === 'casemate')).toBe(true);
    expect(log.some((n) => n.type === 'surrender' || n.type === 'cry')).toBe(true);
    // (plus longue que l'assaut d'avant : la mer et les cartes en plus, 6 à 8 minutes en tout)
    expect(b.t).toBeGreaterThan(150);
    expect(b.t).toBeLessThan(400);
  });

  it('chaque plan gagne sans ordre, la mer gagnée ou perdue, sur deux cartes et les deux peuples, sous 90 unités vivantes', () => {
    for (const seed of [11, 4242]) for (const rival of ['orient', 'asie'] as const) for (const scheme of SCHEMES) for (const sea of ['won', 'lost'] as const) {
      const b = epic(seed, rival, { scheme, sea, air: scheme === 'force', battery: scheme === 'siege' });
      const { max } = run(b);
      expect(b.outcome, `${seed} ${rival} ${scheme} ${sea}`).toBe('won');
      expect(max).toBeLessThanOrEqual(EPIC_CAP);
    }
  });

  it('les plans : le siège bombarde d’abord, le coup de main part à moins d’hommes contre une porte surprise, la mer perdue fait tirer les batteries', () => {
    const siege = epic(4242, 'orient', { scheme: 'siege' });
    expect(siege.siegeT).toBe(SIEGE_T);
    expect(siege.news.some((n) => n.type === 'siege')).toBe(true);
    const force = epic(4242, 'orient', { scheme: 'force' }), raid = epic(4242, 'orient', { scheme: 'raid' });
    expect(raid.troops().length).toBeLessThan(force.troops().length * 0.75);
    expect(raid.gate!.hp).toBeLessThan(force.gate!.hp * 0.5);
    expect(raid.defenders('passage').length).toBeLessThan(force.defenders('passage').length);
    const lost = epic(4242, 'orient', { scheme: 'force', sea: 'lost' });
    const { log } = run(lost);
    expect(log.some((n) => n.type === 'battery')).toBe(true);
    expect(run(epic(4242, 'orient', { scheme: 'force', sea: 'won' })).log.some((n) => n.type === 'battery')).toBe(false);
  });

  it('le choix des remparts : l’appui aérien demande l’héliport, la batterie qui pilonne la batterie côtière, le bélier blindé est toujours là', () => {
    const b = epic(11, 'orient', { scheme: 'force' });
    expect(b.tactic3Why('air')).toBe('heliport');
    expect(b.tactic3Why('pound')).toBe('battery');
    expect(b.tactic3Why('armor')).toBeNull();
    expect(b.autoTactic3()).toBe('armor');
    // (on joue jusqu'au choix, puis le bélier blindé : des blindés de plus, la porte entamée)
    for (let t = 0; t < 400 && b.waiting !== 3; t += 0.25) b.step(0.25, true, false);
    expect(b.waiting).toBe(3);
    expect(b.choose('air')).toBe(false);
    const hp = b.gate!.hp, n = b.troops().length;
    expect(b.choose('armor')).toBe(true);
    expect(b.gate!.hp).toBeLessThan(hp);
    expect(b.troops().filter((u) => u.kind === 'cavalry').length).toBeGreaterThan(0);
    expect(b.troops().length).toBeGreaterThan(n);
    expect(ARMOR_TANKS).toBe(3);
  });

  it('avec tous les renforts des îles, la bataille reste sous 90 unités vivantes : les renforts attendent la place', () => {
    const b = epic(11, 'orient', { scheme: 'force', air: true }, { allies: 12, ours: 6, foes: 0, peace: 0 });
    expect(b.living()).toBeLessThanOrEqual(EPIC_CAP);
    const { max } = run(b);
    expect(max).toBeLessThanOrEqual(EPIC_CAP);
    expect(b.outcome).toBe('won');
  });
});

describe('la paix des vainqueurs (la dernière carte de la guerre)', () => {
  it('reconstruire leur ville : un peu d’or, la ville en ruine puis relevée en quelques jours ; le tribut : deux fois plus d’or, la ruine plus longue', () => {
    const DAY = 100;
    for (const v of ['rebuild', 'tribute'] as const) {
      const w = { diplo: newDiplo(), gold: 0 };
      chooseAlly(w.diplo, 'orient'); choosePath(w.diplo, 'war'); applyDiplo(w.diplo, 'landing');
      expect(chooseVictors(w.diplo, v)).toBe(false);
      expect(claimVictory(w, 50)).toBe(true);
      expect(w.diplo.wonAt).toBe(50);
      // (avant la carte : le tribut d'avant)
      expect(tributePerDay(w.diplo)).toBe(WAR_SPOILS.tribute);
      expect(chooseVictors(w.diplo, v)).toBe(true);
      expect(chooseVictors(w.diplo, 'rebuild')).toBe(false);
      expect(tributePerDay(w.diplo)).toBe(v === 'tribute' ? WAR_SPOILS.tribute * VICTORS_TRIBUTE : REBUILD_GOLD);
      const [r, p] = RUIN_DAYS[v];
      expect(rivalTownState(w.diplo, 50, DAY)).toBe('ruin');
      expect(rivalTownState(w.diplo, 50 + (r + 0.1) * DAY, DAY)).toBe('repair');
      expect(rivalTownState(w.diplo, 50 + (r + p + 0.1) * DAY, DAY)).toBe('intact');
    }
    expect(RUIN_DAYS.tribute[0] + RUIN_DAYS.tribute[1]).toBeGreaterThan(RUIN_DAYS.rebuild[0] + RUIN_DAYS.rebuild[1]);
    // une ancienne partie gagnée (sans heure de victoire) : la ville est déjà relevée, le tribut d'avant continue
    const old = readDiplo({ ally: 'orient', path: 'war', conflict: 'won' });
    expect(rivalTownState(old, 1e6, DAY)).toBe('intact');
    expect(tributePerDay(old)).toBe(WAR_SPOILS.tribute);
    expect(rivalTownState(newDiplo(), 0, DAY)).toBeNull();
  });
});
