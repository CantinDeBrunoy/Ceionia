import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { RivalBattle, BattleKind, BattleNews, BATTLE_LIMIT, raidWave, RAID } from '../src/sim/rivalBattle';
import { newDiplo, readDiplo, saveDiplo, chooseAlly, choosePath, applyDiplo, type DiploState } from '../src/sim/diplomacy';
import { nextBattle, campaignResult, corps, corpsTroops, raidDue, raidLevel, stepCamp, readCamp, CORPS, RAID_FIRST, RAID_EVERY, TRAIN_DAYS } from '../src/sim/campaign';

/**
 * La campagne de l'île rivale (voie de la guerre ; « le mode exploration va trop vite », décision de l'auteur : s'inspirer des
 * Enfers) : le débarquement, deux avant-postes, les sorties contre le camp, l'assaut ; le corps qui garde ses pertes
 */
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
function play(b: RivalBattle) {
  const log: (BattleNews & { t: number })[] = [];
  for (let t = 0; t < BATTLE_LIMIT + 10 && !b.outcome; t += 0.25) {
    b.step(0.25);
    for (const n of b.news.splice(0)) log.push({ ...n, t: b.t });
  }
  return log;
}
const DAY = 130;
const war = (): DiploState => {
  const d = newDiplo();
  chooseAlly(d, 'orient');
  choosePath(d, 'war');
  applyDiplo(d, 'landing');
  return d;
};

describe('la campagne de l’île rivale : l’état', () => {
  it('une ancienne partie aux éclaireurs revenus reprend au débarquement, le corps au complet', () => {
    const d = readDiplo({ ally: 'orient', path: 'war', battle: 'ready', conflict: 'open' });
    expect(d.camp.held).toEqual([]);
    expect(nextBattle(d, 0)).toBe('landing');
    expect(corps(d)).toEqual(CORPS);
    // (une bataille perdue avant la campagne : même chose)
    expect(nextBattle(readDiplo({ ally: 'asie', path: 'war', battle: 'lost', retry: 50, conflict: 'open' }), 0)).toBe('landing');
    // rien avant les éclaireurs, ni sur la voie de la paix
    const d2 = newDiplo(); chooseAlly(d2, 'orient'); choosePath(d2, 'war');
    expect(nextBattle(d2, 0)).toBeNull();
    // (relu de travers : rien de tenu sans la plage, pas de sortie sans camp)
    expect(readCamp({ held: ['port'], raid: 99 }).held).toEqual([]);
    expect(readCamp({ held: ['port'], raid: 99 }).raid).toBe(0);
    expect(readCamp('n’importe quoi').held).toEqual([]);
  });

  it('dans l’ordre : le débarquement, le port, la tour, l’assaut ; la sauvegarde garde tout', () => {
    const d = war();
    campaignResult(d, 'landing', true, [12, 8], 100, DAY);
    expect(d.camp.held).toEqual(['plage']);
    expect(d.camp.raid).toBe(100 + RAID_FIRST * DAY);
    expect(corps(d)).toEqual([12, 8]);
    expect(nextBattle(d, 101)).toBe('port');
    campaignResult(d, 'port', true, [10, 8], 120, DAY);
    expect(nextBattle(d, 121)).toBe('tour');
    campaignResult(d, 'tour', true, [9, 7], 140, DAY);
    expect(nextBattle(d, 141)).toBe('assault');
    const back = readDiplo(JSON.parse(JSON.stringify(saveDiplo(d))));
    expect(back.camp).toEqual(d.camp);
  });

  it('se faire attaquer : la sortie vient, s’annonce, se repousse (la suivante plus forte) ; perdue, le dernier avant-poste est reperdu', () => {
    const d = war();
    campaignResult(d, 'landing', true, [15, 10], 0, DAY);
    campaignResult(d, 'port', true, [15, 10], 10, DAY);
    expect(raidDue(d, RAID_FIRST * DAY - 1)).toBe(false);
    expect(stepCamp(d, RAID_FIRST * DAY - 10, DAY)).toBe('warn');
    expect(stepCamp(d, RAID_FIRST * DAY - 5, DAY)).toBeNull();
    expect(nextBattle(d, RAID_FIRST * DAY)).toBe('defend');
    const lvl = raidLevel(d);
    campaignResult(d, 'defend', true, [14, 10], RAID_FIRST * DAY, DAY);
    expect(raidLevel(d)).toBe(lvl + 1);
    expect(d.camp.raid).toBe(RAID_FIRST * DAY + RAID_EVERY * DAY);
    const lost = campaignResult(d, 'defend', false, [3, 2], 1000, DAY);
    expect(lost).toBe('port');
    expect(d.camp.held).toEqual(['plage']);
    expect(nextBattle(d, 1001)).toBe('port');
    // la plage seule perdue : il faut redébarquer, au complet
    expect(campaignResult(d, 'defend', false, [0, 0], 2000, DAY)).toBe('plage');
    expect(nextBattle(d, 2001)).toBe('landing');
    expect(corps(d)).toEqual(CORPS);
  });

  it('la caserne avancée refait le corps peu à peu', () => {
    const d = war();
    campaignResult(d, 'landing', true, [5, 5], 0, DAY);
    expect(corps(d)).toEqual([5, 5]);
    stepCamp(d, TRAIN_DAYS * DAY * 4 + 1, DAY);
    const [s, a] = corps(d);
    expect(s + a).toBe(14);
    stepCamp(d, DAY * 100, DAY);
    expect(corps(d)).toEqual(CORPS);
    expect(corpsTroops(d, 2).filter((k) => k === 'knight').length).toBe(CORPS[0]);
  });

  it('une sortie grossit avec les sorties repoussées et les avant-postes, moins en facile', () => {
    expect(raidWave(0)).toEqual(RAID);
    expect(raidWave(3)[0]).toBeGreaterThan(RAID[0]);
    expect(raidWave(99)[0] + raidWave(99)[1]).toBeLessThanOrEqual(14);
    expect(raidWave(0, true)[0]).toBeLessThan(RAID[0]);
  });
});

describe('la campagne de l’île rivale : les batailles', () => {
  afterAll(() => setMapSize(192));
  const battle = (kind: BattleKind, age: number, o: { held?: ('plage' | 'port' | 'tour')[]; raid?: number; seed?: number; rival?: 'asie' | 'orient' } = {}) =>
    new RivalBattle(archipel(o.seed ?? 11), o.rival ?? 'asie', age, false, undefined, [], undefined, { kind, held: o.held, raid: o.raid });

  it('chaque bataille joue ses seuls objectifs', () => {
    expect(battle('landing', 2).plan).toEqual(['plage']);
    const tour = battle('tour', 2);
    expect(tour.tower).not.toBeNull();
    expect(tour.gate).toBeNull();
    const assault = battle('assault', 2, { held: ['plage', 'port', 'tour'] });
    expect(assault.current).toBe('remparts');
    expect(assault.waiting).toBe(1);
    expect(assault.defenders('port').length).toBe(0);
    const def = battle('defend', 2);
    expect(def.camp).not.toBeNull();
    // (depuis le camp, tout le monde est là d'emblée)
    expect(def.troops().length).toBe(CORPS[0] + CORPS[1]);
    expect(def.allied().length).toBeGreaterThan(0);
  });

  it('chaque bataille se gagne sans ordre, le corps au complet, à chaque âge ; et la campagne dure plus qu’une bataille d’un tenant', () => {
    const kinds: BattleKind[] = ['landing', 'port', 'tour', 'defend', 'assault'];
    for (const age of [1, 2, 3, 4, 5]) {
      let total = 0;
      for (const kind of kinds) {
        const b = battle(kind, age, { held: kind === 'assault' ? ['plage', 'port', 'tour'] : ['plage'], raid: kind === 'defend' ? 3 : 0 });
        const log = play(b);
        expect(b.outcome, `${kind} à l’âge ${age}`).toBe('won');
        expect(log.at(-1)).toMatchObject({ type: 'end', outcome: 'won' });
        total += b.t;
        // le corps survit en partie : il en reste pour la suite
        const [s, a] = b.survivors();
        expect(s + a, `${kind} à l’âge ${age}`).toBeGreaterThan(3);
      }
      expect(total, `âge ${age}`).toBeGreaterThan(200);
    }
  });

  it('la tour tire : il faut l’abattre ; la sortie s’abat sur le camp en deux vagues', () => {
    const tour = battle('tour', 2), log = play(tour);
    expect(log.some((n) => n.type === 'tower')).toBe(true);
    expect(tour.tower!.down).toBe(true);
    const def = battle('defend', 2, { raid: 2 }), dl = play(def);
    expect(dl.filter((n) => n.type === 'raid').length).toBe(2);
  });

  it('un corps très entamé peut perdre la défense : le camp tombe', () => {
    const b = new RivalBattle(archipel(11), 'asie', 2, false, ['archer'], [], undefined, { kind: 'defend', raid: 8 });
    play(b);
    expect(b.outcome).toBe('lost');
    expect(b.camp!.down || !b.troops().length).toBe(true);
  });
});
