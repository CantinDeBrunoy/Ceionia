import { describe, it, expect } from 'vitest';
import { newDiplo, readDiplo, chooseAlly, choosePath, applyDiplo, missionWhy, saveDiplo } from '../src/sim/diplomacy';
import { sagaSteps, stepNow, signPeace, chapterDone, type SagaCtx } from '../src/sim/saga';
import {
  newGames, readGames, gamesStage, deliver, deliverWhy, startHost, stepHost, hostShare, hostDone, settleSurprise, welcomeNow, welcomeScore,
  playTrial, trialChance, medals, ceremonyDone, chooseEnd, gamesGold, DELIVERIES, DELIVERY_COST, HOST_DAYS, SURPRISE_AT, TRIALS, SURPRISE_CHOICES, TREATY_GOLD, UNION_GOLD,
} from '../src/sim/islandGames';
import { MISSIONS } from '../src/sim/missions';
import { zoneLock } from '../src/sim/concession';

/**
 * Les Jeux des îles (chantier D du nouveau monde : le grand moment de la paix, au Moderne, à la place de l'Exposition) : la
 * candidature (un pourparler qui peut échouer), le site et son chantier en trois livraisons, l'accueil et ses surprises, les
 * épreuves, la cérémonie, puis le traité ou l'union : la paix
 */
const DAY = 100;
const world = () => ({ isles: {} as any, diplo: newDiplo(), exp: { done: [] as string[], clock: 0 }, gold: 0, buildings: new Map() }) as any;
const kinds = (c: Record<string, number> = {}): SagaCtx => ({ count: (k) => c[k] ?? 0 });
const CONCESSION = { merchantPort: 1, exchangeHall: 1, commonSchool: 1 };
const GOOD = { housing: 1, food: 1, joy: 1, transport: 1 };

/** Une partie sur la voie de la paix, le chapitre de l'Industriel fait (les Jeux s'ouvrent) */
function atModern() {
  const w = world();
  chooseAlly(w.diplo, 'orient'); choosePath(w.diplo, 'peace');
  w.exp.done.push('envoys', 'truce'); applyDiplo(w.diplo, 'post'); applyDiplo(w.diplo, 'truce');
  w.diplo.saga.done.push(2, 3);
  return w;
}
/** L'accueil, joué jusqu'au bout ; chaque surprise réglée par son choix `pick` (0 : le premier) */
function host(g: ReturnType<typeof newGames>, needs = GOOD, pick = 0) {
  const seen: string[] = [];
  for (let t = 0; t < HOST_DAYS * DAY + 10 && !hostDone(g); t += 1) {
    const s = stepHost(g, t, DAY, needs, 1, () => 0);
    if (s) seen.push(s);
    if (g.pending) settleSurprise(g, SURPRISE_CHOICES[g.pending][pick].id);
  }
  return seen;
}

describe('les Jeux des îles (la paix, au Moderne)', () => {
  it('la candidature : une expédition de pourparlers à trois peuples, qui peut échouer, après le chapitre de l’Industriel', () => {
    const m = MISSIONS.find((x) => x.id === 'gamesBid')!;
    expect(m).toMatchObject({ age: 4, talks: true });
    expect(m.choices.every((c) => c.win.some((e) => e.t === 'diplo' && e.act === 'bid'))).toBe(true);
    // (l'échec ne coûte rien : elle se retente)
    expect(m.choices.every((c) => c.lose.length === 0)).toBe(true);
    const w = atModern();
    w.diplo.saga.done = [2];
    expect(missionWhy(w, 'gamesBid')).toMatch(/Industriel/);
    w.diplo.saga.done = [2, 3];
    expect(missionWhy(w, 'gamesBid')).toBeNull();
    expect(stepNow(w, 4, kinds(CONCESSION))).toMatchObject({ id: 'bid', go: 'mission' });
    // (le site des Jeux ne se bâtit qu'une fois la candidature acceptée)
    expect(zoneLock(w, 'gamesSite')).toMatch(/candidature/);
    applyDiplo(w.diplo, 'bid');
    expect(w.diplo.games.bid).toBe(true);
    expect(zoneLock(w, 'gamesSite')).toBeNull();
  });

  it('chaque étape dans l’ordre : le site, trois livraisons, l’accueil et ses surprises, les trois épreuves, la cérémonie, la dernière carte', () => {
    const w = atModern(), g = w.diplo.games;
    applyDiplo(w.diplo, 'bid');
    expect(gamesStage(g, false)).toBe('build');
    expect(stepNow(w, 4, kinds(CONCESSION))).toMatchObject({ id: 'gamesSite', go: 'build', kind: 'gamesSite' });
    // le chantier : trois livraisons, payées avec les stocks ; pas sans le site, ni sans de quoi payer
    const st = { bricks: DELIVERY_COST.bricks * 3, ore: DELIVERY_COST.ore * 3, gold: DELIVERY_COST.gold * 3 - 1 };
    expect(deliverWhy(g, false, st)).toBe('site');
    for (let i = 0; i < 2; i++) expect(deliver(g, true, st)).toBe(true);
    expect(deliver(g, true, st)).toBe(false);
    expect(deliverWhy(g, true, st)).toBe('res');
    st.gold += 1;
    expect(deliver(g, true, st)).toBe(true);
    expect(g.delivered).toBe(DELIVERIES);
    expect(st).toEqual({ bricks: 0, ore: 0, gold: 0 });
    expect(stepNow(w, 4, kinds({ ...CONCESSION, gamesSite: 1 }))).toMatchObject({ id: 'host', go: 'games' });
    // l'accueil : une jauge, deux surprises à leurs moments, réglées par une carte
    expect(gamesStage(g, true)).toBe('host');
    expect(startHost(g, 0)).toBe(true);
    expect(startHost(g, 0)).toBe(false);
    expect(hostShare(g, HOST_DAYS * DAY / 2, DAY)).toBeCloseTo(0.5);
    const seen = host(g);
    expect(seen).toHaveLength(SURPRISE_AT.length);
    expect(new Set(seen).size).toBe(seen.length);
    expect(hostDone(g)).toBe(true);
    expect(welcomeScore(g)).toBeGreaterThan(90);
    // les épreuves : trois cartes ; la chance suit ce qu'apporte le village
    expect(gamesStage(g, true)).toBe('trials');
    expect(trialChance('regatta', 'fair', { ships: 5, transport: 0, troops: 0 })).toBeGreaterThan(trialChance('regatta', 'fair', { ships: 0, transport: 0, troops: 0 }));
    expect(playTrial(g, 'fair', { ships: 5, transport: 1, troops: 30 }, 0)).toMatchObject({ id: 'regatta', won: true });
    expect(playTrial(g, 'bold', { ships: 0, transport: 0, troops: 0 }, 0.99)).toMatchObject({ id: 'race', won: false });
    // (laisser gagner l'invité : pas de médaille, mais l'accueil y gagne)
    const before = welcomeScore(g);
    expect(playTrial(g, 'guest', { ships: 5, transport: 1, troops: 30 }, 0)).toMatchObject({ id: 'tourney', won: false });
    expect(welcomeScore(g)).toBeGreaterThanOrEqual(before);
    expect(playTrial(g, 'fair', GOOD as any, 0)).toBeNull();
    expect(medals(g)).toBe(1);
    // la cérémonie, puis la dernière carte : la paix
    expect(gamesStage(g, true)).toBe('ceremony');
    expect(chooseEnd(g, 'treaty')).toBe(false);
    expect(ceremonyDone(g)).toBe(true);
    const c = kinds({ ...CONCESSION, gamesSite: 1 });
    expect(stepNow(w, 4, c)).toMatchObject({ id: 'ceremony', go: 'games' });
    expect(chooseEnd(g, 'treaty')).toBe(true);
    expect(chooseEnd(g, 'union')).toBe(false);
    expect(signPeace(w, c)).toBe(true);
    expect(w.diplo.conflict).toBe('peace');
    expect(chapterDone(w, 4, c)).toBe(true);
    expect(gamesStage(g, true)).toBe('done');
    expect(sagaSteps(w, c).every((s) => s.done)).toBe(true);
  });

  it('un village qui ne tient pas fait un accueil médiocre ; les surprises mal réglées le font baisser', () => {
    expect(welcomeNow({ housing: 0.5, food: 0.5, joy: 0.5, transport: 0 })).toBe(40);
    expect(welcomeNow({ housing: 2, food: 1, joy: 1, transport: 1 })).toBe(100);
    const good = newGames(), bad = newGames();
    for (const g of [good, bad]) { g.bid = true; g.delivered = DELIVERIES; startHost(g, 0); }
    host(good, GOOD, 0);
    host(bad, { housing: 0.4, food: 0.5, joy: 0.3, transport: 0 }, 1);
    expect(welcomeScore(bad)).toBeLessThan(welcomeScore(good) - 40);
  });

  it('les deux fins : le traité (plus d’or chaque jour) ou l’union (moins d’or, les îles sûres, le savoir partagé)', () => {
    for (const end of ['treaty', 'union'] as const) {
      const g = newGames();
      g.bid = true; g.delivered = DELIVERIES; startHost(g, 0); host(g);
      for (let i = 0; i < TRIALS.length; i++) playTrial(g, 'fair', { ships: 3, transport: 1, troops: 10 }, 0.5);
      ceremonyDone(g);
      expect(chooseEnd(g, end)).toBe(true);
      expect(gamesGold(g)).toBe(end === 'treaty' ? TREATY_GOLD : UNION_GOLD);
    }
    expect(gamesGold(newGames())).toBe(0);
  });

  it('les sauvegardes : l’état des Jeux se relit, un champ abîmé ou absent donne l’état vierge ; une ancienne partie n’en a pas', () => {
    const g = newGames();
    g.bid = true; g.delivered = 2; g.hostAt = 40; g.surprises = ['storm']; g.trials = [{ id: 'regatta', won: true }];
    expect(readGames(JSON.parse(JSON.stringify(g)))).toEqual(g);
    expect(readGames({ delivered: 99, surprises: ['x', 'late'], trials: [{ id: 'nope' }, { id: 'race', won: 1 }], end: 'war' })).toMatchObject({ delivered: DELIVERIES, surprises: ['late'], trials: [{ id: 'race', won: false }], end: null });
    expect(readGames(undefined)).toEqual(newGames());
    // une ancienne partie : ni Jeux, ni choix des vainqueurs ; la sauvegarde d'un état vierge n'écrit rien
    const old = readDiplo({ ally: 'asie', path: 'peace', conflict: 'peace' });
    expect(old.games).toEqual(newGames());
    expect(old.victors).toBeNull();
    expect(old.wonAt).toBe(-1);
    expect(saveDiplo(newDiplo())).toBeUndefined();
    const d = newDiplo(); d.games.bid = true;
    expect(readDiplo(JSON.parse(JSON.stringify(saveDiplo(d)))).games.bid).toBe(true);
  });
});
