import { describe, it, expect, beforeAll } from 'vitest';
import { setMapSize, World } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { War, EASE_K, EASE_MAX } from '../src/sim/war';

/**
 * Adoucir les Enfers (retour de l'auteur, 26 nov. 2026) : deux camps de base perdus de suite, la carte propose de baisser la
 * difficulté. Jamais d'office : refusée, rien ne change ; acceptée, les effectifs démoniaques baissent d'un cran
 */
describe('les Enfers adoucis à la demande', () => {
  beforeAll(() => setMapSize(192));
  function arrive(difficulty: World['difficulty'] = 'normal') {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.difficulty = difficulty;
    w.portalWoken = true;
    const war = new War(w);
    war.wake();
    war.welcome(1);
    war.update(0.1, 1);
    return war;
  }
  const lose = (war: War, type: 'campLost' | 'occupied' = 'campLost') => { war.base!.events.push({ type, zone: 1 } as never); war.update(0.1, 1); };

  it('un camp perdu ne suffit pas, deux de suite ouvrent la carte ; une contre-attaque repoussée remet le compte à zéro', () => {
    const war = arrive();
    lose(war);
    expect(war.easeAsk).toBe(false);
    war.base!.events.push({ type: 'counterEnd', zone: 1 } as never); war.update(0.1, 1);
    lose(war);
    expect(war.easeAsk).toBe(false);
    lose(war, 'occupied');
    expect(war.easeAsk).toBe(true);
    // rien n'est baissé d'office
    expect(war.faction!.balance.k).toBe(1);
  });

  it('refusée : rien ne change, elle revient après deux autres camps perdus', () => {
    const war = arrive();
    lose(war); lose(war);
    war.answerEase(false);
    expect(war.easeAsk).toBe(false);
    expect(war.faction!.balance.k).toBe(1);
    lose(war);
    expect(war.easeAsk).toBe(false);
    lose(war);
    expect(war.easeAsk).toBe(true);
  });

  it('acceptée : un cran de moins tout de suite, gardé dans la sauvegarde, au plus EASE_MAX crans', () => {
    const war = arrive('easy');
    lose(war); lose(war);
    war.answerEase(true);
    expect(war.faction!.balance.k).toBeCloseTo(0.6 * EASE_K);
    const again = new War(war.world);
    again.load(JSON.parse(JSON.stringify(war.save())));
    expect(again.ensureFaction().balance.k).toBeCloseTo(0.6 * EASE_K);
    for (let i = 0; i < EASE_MAX + 2; i++) { lose(war); lose(war); if (war.easeAsk) war.answerEase(true); }
    expect(war.ease).toBe(EASE_MAX);
    expect(war.easeAsk).toBe(false);
  });

  it('une ancienne sauvegarde se relit : aucun cran, aucun camp compté', () => {
    const war = new War(arrive().world);
    war.load({ army: { troops: [], queue: [] } });
    expect(war.ease).toBe(0);
    expect(war.lostRow).toBe(0);
    expect(war.easeAsk).toBe(false);
  });

  it('jamais au bac à sable (ancien équilibre)', () => {
    const war = arrive('sandbox');
    lose(war); lose(war);
    expect(war.easeAsk).toBe(false);
  });
});
