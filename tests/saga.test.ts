import { describe, it, expect } from 'vitest';
import { newDiplo, readDiplo, chooseAlly, choosePath, applyDiplo, claimVictory, settleLate, conflictState, type DiploState } from '../src/sim/diplomacy';
import { sagaSteps, chapterDone, chapterItem, stepSaga, catchUp, signPeace, stepNow, readSaga, CONFLICT_LABEL, CHAPTER_LABELS, isChapterLabel, type SagaCtx } from '../src/sim/saga';
import { nextBattle, campaignResult, stepCamp, raidDue, corpsMax, corpsTroops, RAID_FIRST, BATTLE_AGE } from '../src/sim/campaign';
import { ageGo } from '../src/sim/sim';

/**
 * Le fil des âges (chantier A du nouveau monde, décision de l'auteur du 24 nov. 2026) : le conflit des deux îles en trois
 * chapitres, le Médiéval, l'Industriel et le Moderne, chacun une condition du passage à l'âge suivant
 */
const DAY = 100;
const world = (d: DiploState = newDiplo()) => ({ isles: {} as any, diplo: d, exp: { done: [] as string[], clock: 0 }, gold: 0 }) as any;
const kinds = (c: Record<string, number> = {}): SagaCtx => ({ count: (k) => c[k] ?? 0 });

/** Une partie au Médiéval, l'allié choisi, sur une voie */
function onPath(path: 'war' | 'peace') {
  const w = world();
  chooseAlly(w.diplo, 'orient');
  choosePath(w.diplo, path);
  return w;
}
/** Gagne la bataille de la campagne qui vient (à cet âge) */
function win(w: any, age: number) {
  const k = nextBattle(w.diplo, w.exp.clock, age);
  expect(k).not.toBeNull();
  if (k === 'assault') { expect(claimVictory(w)).toBe(true); return k; }
  campaignResult(w.diplo, k!, true, corpsMax(w.diplo, age), w.exp.clock, DAY, age);
  return k;
}

describe('le fil des âges : la voie de la guerre', () => {
  it('se joue du Médiéval au Moderne, une étape après l’autre, chaque chapitre une condition d’âge', () => {
    const w = onPath('war');
    const item = (next: number) => chapterItem(w, next)!;
    expect(item(3)).toMatchObject({ label: CHAPTER_LABELS[2], have: 0, need: 3 });
    // au Médiéval : les éclaireurs, le débarquement, la première sortie repoussée
    expect(stepNow(w, 2)!.id).toBe('allywar');
    w.exp.done.push('allywar'); applyDiplo(w.diplo, 'landing');
    expect(nextBattle(w.diplo, 0, 2)).toBe('landing');
    expect(win(w, 2)).toBe('landing');
    expect(item(3)).toMatchObject({ have: 2, need: 3 });
    // le port attend l'Industriel : rien d'autre à livrer au Médiéval que la défense du camp
    expect(nextBattle(w.diplo, 0, 2)).toBeNull();
    expect(stepNow(w, 2)!.id).toBe('camp');
    w.exp.clock = RAID_FIRST * DAY;
    expect(raidDue(w.diplo, w.exp.clock)).toBe(true);
    expect(nextBattle(w.diplo, w.exp.clock, 2)).toBe('defend');
    campaignResult(w.diplo, 'defend', true, corpsMax(w.diplo, 2), w.exp.clock, DAY, 2);
    expect(chapterDone(w, 2)).toBe(true);
    expect(stepSaga(w, 2)).toBe(2);
    expect(stepSaga(w, 2)).toBeNull();
    expect(item(3)).toMatchObject({ have: 1, need: 1 });
    // le chapitre fait : les sorties attendent l'âge suivant (un joueur lent n'est jamais pressé)
    w.exp.clock += 50 * DAY;
    stepCamp(w.diplo, w.exp.clock, DAY, 2);
    expect(raidDue(w.diplo, w.exp.clock)).toBe(false);
    expect(w.diplo.camp.raid).toBe(w.exp.clock + RAID_FIRST * DAY);
    // à l'Industriel : le port, puis la tour ; le corps a grandi
    expect(corpsTroops(w.diplo, 3).length).toBe(30);
    expect(nextBattle(w.diplo, w.exp.clock, 3)).toBe('port');
    stepCamp(w.diplo, w.exp.clock, DAY, 3);
    expect(raidDue(w.diplo, w.exp.clock)).toBe(false);
    expect(item(4)).toMatchObject({ label: CHAPTER_LABELS[3], have: 0, need: 2 });
    expect(win(w, 3)).toBe('port');
    expect(win(w, 3)).toBe('tour');
    expect(nextBattle(w.diplo, w.exp.clock, 3)).toBeNull();
    expect(stepSaga(w, 3)).toBe(3);
    // au Moderne : l'assaut (provisoire : la bataille des deux îles du chantier D) règle le conflit
    expect(item(5)).toMatchObject({ label: CONFLICT_LABEL, have: 0, need: 1 });
    expect(sagaSteps(w).find((s) => s.id === 'assault')!.stub).toBe('D');
    expect(win(w, 4)).toBe('assault');
    expect(w.diplo.conflict).toBe('won');
    expect(item(5)).toMatchObject({ have: 1, need: 1 });
  });

  it('un chapitre fait le reste, même si une sortie reprend ensuite ce qu’on tenait', () => {
    const w = onPath('war');
    w.diplo.battle = 'ready';
    w.diplo.camp.held = ['plage', 'port', 'tour'];
    expect(stepSaga(w, 3)).toBe(3);
    campaignResult(w.diplo, 'defend', false, [0, 0], 0, DAY, 3);
    expect(w.diplo.camp.held).toEqual(['plage', 'port']);
    expect(chapterDone(w, 3)).toBe(true);
    // au Moderne, il faut d'abord reprendre la tour avant l'assaut
    expect(nextBattle(w.diplo, 0, 4)).toBe('tour');
  });

  it('chaque bataille a son âge', () => {
    expect(BATTLE_AGE).toEqual({ landing: 2, port: 3, tour: 3, assault: 4 });
    const w = onPath('war');
    w.diplo.battle = 'ready';
    w.diplo.camp.held = ['plage', 'port', 'tour'];
    expect(nextBattle(w.diplo, 0, 3)).toBeNull();
    expect(nextBattle(w.diplo, 0, 4)).toBe('assault');
  });
});

describe('le fil des âges : la voie de la paix', () => {
  it('se joue du Médiéval au Moderne : la trêve, un second comptoir, l’ambassade, puis la paix signée', () => {
    const w = onPath('peace');
    expect(chapterItem(w, 3)).toMatchObject({ have: 0, need: 2 });
    w.exp.done.push('envoys'); applyDiplo(w.diplo, 'post');
    w.exp.done.push('truce'); applyDiplo(w.diplo, 'truce');
    // la trêve : le chapitre du Médiéval, la cinématique, le conflit encore ouvert, les combats en mer cessent
    expect(w.diplo.saga.truce).toBe(true);
    expect(w.diplo.cine).toBe(true);
    expect(w.diplo.conflict).toBe('open');
    expect(conflictState(w)).toEqual({ kind: 'peace' });
    expect(stepSaga(w, 2)).toBe(2);
    // à l'Industriel (provisoire : le port marchand partagé du chantier C) : un second comptoir chez l'allié
    let c = kinds({ tradepost: 1 });
    expect(stepNow(w, 3, c)).toMatchObject({ id: 'post2', go: 'build', kind: 'tradepost', stub: 'C' });
    expect(chapterItem(w, 4, c)).toMatchObject({ have: 0, need: 1 });
    c = kinds({ tradepost: 2 });
    expect(stepSaga(w, 3, c)).toBe(3);
    // au Moderne (provisoire : les Jeux des îles, chantier D) : l'ambassade bâtie, puis la paix signée
    expect(signPeace(w, c)).toBe(false);
    c = kinds({ tradepost: 2, embassy: 1 });
    expect(stepNow(w, 4, c)).toMatchObject({ id: 'sign', go: 'sign' });
    expect(chapterItem(w, 5, c)).toMatchObject({ have: 1, need: 2 });
    expect(signPeace(w, c)).toBe(true);
    expect(w.diplo.conflict).toBe('peace');
    expect(chapterItem(w, 5, c)).toMatchObject({ have: 1, need: 1 });
    expect(signPeace(w, c)).toBe(false);
  });

  it('un joueur rapide qui a bâti d’avance voit le chapitre fait dès l’âge venu', () => {
    const w = onPath('peace');
    w.exp.done.push('envoys');
    applyDiplo(w.diplo, 'truce');
    const c = kinds({ tradepost: 2 });
    // (noté seulement à son âge)
    expect(stepSaga(w, 2, c)).toBe(2);
    expect(w.diplo.saga.done).toEqual([2]);
    expect(stepSaga(w, 3, c)).toBe(3);
  });
});

describe('le fil des âges : les conditions d’âge', () => {
  it('trois libellés, tous reconnus par le panneau des âges (un clic rouvre la feuille de route)', () => {
    for (const l of Object.values(CHAPTER_LABELS)) {
      expect(isChapterLabel(l)).toBe(true);
      expect(ageGo({ label: l, have: 0, need: 1 })).toEqual({ req: 'conflict' });
    }
    expect(CHAPTER_LABELS[4]).toBe(CONFLICT_LABEL);
  });

  it('sans voie prise : une condition à remplir (choisir), sans voie au-delà du Moderne : aucune', () => {
    const w = world();
    chooseAlly(w.diplo, 'asie');
    expect(chapterItem(w, 3)).toMatchObject({ have: 0, need: 1 });
    expect(chapterItem(w, 6)).toBeNull();
    expect(chapterItem(w, 2)).toBeNull();
  });
});

describe('le fil des âges : les anciennes sauvegardes', () => {
  it('sans archipel ou sans allié : rien ne change', () => {
    const w = world(readDiplo({}));
    w.isles = null;
    expect(chapterItem(w, 3)).toBeNull();
    expect(stepSaga(world(readDiplo({})), 2)).toBeNull();
  });

  it('Médiéval, aucune voie prise : le nouveau déroulé, du début', () => {
    const w = world(readDiplo({ ally: 'orient', conflict: 'open' }));
    expect(w.diplo.saga).toEqual({ done: [], truce: false });
    expect(catchUp(w.diplo, 2, 0, DAY)).toBe(false);
    expect(chapterItem(w, 3)).toMatchObject({ have: 0 });
  });

  it('Médiéval, guerre, éclaireurs revenus sans camp : le débarquement d’abord', () => {
    const w = world(readDiplo({ ally: 'orient', path: 'war', conflict: 'open', battle: 'ready' }));
    w.exp.done.push('allywar');
    expect(nextBattle(w.diplo, 0, 2)).toBe('landing');
    expect(stepNow(w, 2)!.id).toBe('plage');
  });

  it('Médiéval, guerre, le camp, le port et la tour déjà pris : ils restent pris et comptent pour l’Industriel', () => {
    const w = world(readDiplo({ ally: 'orient', path: 'war', conflict: 'open', battle: 'ready', camp: { held: ['plage', 'port', 'tour'], raid: 500 } }));
    expect(chapterDone(w, 2)).toBe(true);
    expect(stepSaga(w, 2)).toBe(2);
    expect(chapterDone(w, 3)).toBe(true);
    // (le port est pris, rien à livrer au Médiéval : les sorties attendent)
    expect(nextBattle(w.diplo, 0, 2)).toBeNull();
    stepCamp(w.diplo, 600, DAY, 2);
    expect(raidDue(w.diplo, 600)).toBe(false);
    expect(stepSaga(w, 3)).toBe(3);
    expect(nextBattle(w.diplo, 600, 4)).toBe('assault');
  });

  it('Médiéval, paix, émissaires faits : l’ambassade donne la trêve', () => {
    const w = world(readDiplo({ ally: 'orient', path: 'peace', conflict: 'open', post: true }));
    w.exp.done.push('envoys');
    expect(stepNow(w, 2)!.id).toBe('truce');
    applyDiplo(w.diplo, 'truce');
    expect(w.diplo.saga.truce).toBe(true);
    expect(chapterDone(w, 2)).toBe(true);
  });

  it('conflit déjà réglé, quel que soit l’âge : il reste réglé, tous les chapitres comptent', () => {
    for (const conflict of ['peace', 'won', 'treaty'] as const) {
      for (const age of [2, 3, 4, 5]) {
        const w = world(readDiplo({ ally: 'asie', path: conflict === 'won' ? 'war' : 'peace', conflict }));
        expect(settleLate(w.diplo, age, true)).toBe(false);
        expect(w.diplo.conflict).toBe(conflict);
        if (age < 5) expect(chapterItem(w, age + 1)).toMatchObject({ have: 1, need: 1 });
        expect(catchUp(w.diplo, age, 0, DAY)).toBe(false);
      }
    }
    // l'ancienne paix signée par l'ambassade : la trêve n'est pas notée, la paix reste
    const old = world(readDiplo({ ally: 'asie', path: 'peace', conflict: 'peace' }));
    expect(conflictState(old)).toEqual({ kind: 'peace' });
  });

  it('archipel accepté tard, à l’Industriel : le chapitre du Médiéval est compté fait, avec ce qu’il donne', () => {
    // la guerre : la plage prise (le camp et sa caserne), on commence au port
    const war = world(readDiplo({ ally: 'orient', path: 'war', conflict: 'open' }));
    expect(catchUp(war.diplo, 3, 1000, DAY)).toBe(true);
    expect(war.diplo.saga.done).toEqual([2]);
    expect(war.diplo.camp.held).toEqual(['plage']);
    expect(war.diplo.battle).toBe('ready');
    expect(war.diplo.camp.raid).toBe(1000 + RAID_FIRST * DAY);
    expect(nextBattle(war.diplo, 1000, 3)).toBe('port');
    expect(catchUp(war.diplo, 3, 1000, DAY)).toBe(false);
    // la paix : la trêve
    const peace = world(readDiplo({ ally: 'orient', path: 'peace', conflict: 'open' }));
    catchUp(peace.diplo, 3, 0, DAY);
    expect(peace.diplo.saga).toEqual({ done: [2], truce: true });
    expect(peace.diplo.post).toBe(true);
    expect(stepNow(peace, 3)!.id).toBe('post2');
    // sans voie : rien n'est compté tant qu'elle n'est pas prise
    const none = world(readDiplo({ ally: 'orient', conflict: 'open' }));
    expect(catchUp(none.diplo, 3, 0, DAY)).toBe(false);
  });

  it('archipel accepté au Moderne : seulement le chapitre du Moderne', () => {
    const war = world(readDiplo({ ally: 'orient', path: 'war', conflict: 'open' }));
    catchUp(war.diplo, 4, 0, DAY);
    expect(war.diplo.saga.done).toEqual([2, 3]);
    expect(war.diplo.camp.held).toEqual(['plage', 'port', 'tour']);
    expect(nextBattle(war.diplo, 0, 4)).toBe('assault');
    expect(chapterItem(war, 5)).toMatchObject({ have: 0, need: 1 });
  });

  it('archipel accepté au Futuriste : traité d’office', () => {
    const w = world(readDiplo({ ally: 'orient', conflict: 'open' }));
    expect(settleLate(w.diplo, 5, true)).toBe(true);
    expect(w.diplo.conflict).toBe('treaty');
  });

  it('l’état des chapitres se relit, un champ abîmé donne l’état vierge', () => {
    expect(readSaga({ done: [2, 9, 'x', 3], truce: true })).toEqual({ done: [2, 3], truce: true });
    expect(readSaga('oui')).toEqual({ done: [], truce: false });
    const d = readDiplo({ ally: 'asie', saga: { done: [2], truce: true } });
    expect(d.saga).toEqual({ done: [2], truce: true });
    expect(readDiplo(JSON.parse(JSON.stringify(d))).saga).toEqual(d.saga);
  });
});
