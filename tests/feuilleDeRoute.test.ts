import { describe, it, expect } from 'vitest';
import { newDiplo, chooseAlly, choosePath, applyDiplo, loseAllyBattle, winAllyWar, WAR_MISSION } from '../src/sim/diplomacy';
import { roadView, prepGain, type RoadCtx } from '../src/sim/diploRoad';
import { ISLE_MISSIONS } from '../src/sim/isleMissions';
import { roadHtml } from '../src/ui/diploChoice';
import { campaignResult, RAID_FIRST } from '../src/sim/campaign';

/**
 * La feuille de route du conflit des deux îles (retour de joueurs, 22 nov. 2026 : « perdu » après « Aider notre allié » ou
 * « Négocier la paix ») : les étapes qui déclenchent la suite, et les visites des îles qui la préparent
 */
const world = () => ({ isles: {} as any, diplo: newDiplo(), exp: { done: [] as string[], clock: 0 } }) as any;
const ctx = (running: string[] = [], age = 2): RoadCtx => ({ running: (id) => running.includes(id), dayLen: 100, age });

describe('la feuille de route', () => {
  it('rien sans voie prise, ni le conflit réglé', () => {
    const w = world();
    expect(roadView(w, ctx())).toBeNull();
    chooseAlly(w.diplo, 'orient');
    expect(roadView(w, ctx())).toBeNull();
    choosePath(w.diplo, 'war');
    expect(roadView(w, ctx())).not.toBeNull();
    winAllyWar(w.diplo);
    expect(roadView(w, ctx())).toBeNull();
  });

  it('la guerre : les éclaireurs d’abord, puis la campagne de l’île rivale, et des visites qui donnent des troupes', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'war');
    let r = roadView(w, ctx())!;
    expect(r.steps.map((s) => [s.id, s.state, s.go])).toEqual([[WAR_MISSION, 'now', 'mission'], ['plage', 'next', 'wait'], ['camp', 'next', 'wait'], ['port', 'next', 'wait'], ['tour', 'next', 'wait'], ['assault', 'next', 'wait']]);
    // (trois chapitres : le Médiéval déplié, les deux autres plus tard)
    expect(r.chapters.map((c) => [c.age, c.state])).toEqual([[2, 'now'], [3, 'later'], [4, 'later']]);
    // (pour la guerre, seulement les visites qui rapportent à la bataille ; le vol des semences n'y est pas)
    expect(r.prep.length).toBeGreaterThan(3);
    expect(r.prep.every((p) => /alliés|soldats|ennemis/.test(p.gain))).toBe(true);
    expect(r.prep.some((p) => p.id === 'isleSeeds')).toBe(false);
    expect(r.prep.some((p) => p.id === 'isleSabotage')).toBe(true);
    // en route : le bouton ne relance rien
    expect(roadView(w, ctx([WAR_MISSION]))!.steps[0]).toMatchObject({ state: 'now', go: 'wait' });
    w.exp.done.push(WAR_MISSION);
    applyDiplo(w.diplo, 'landing');
    r = roadView(w, ctx())!;
    expect(r.steps.slice(0, 2).map((s) => [s.state, s.go])).toEqual([['done', 'wait'], ['now', 'battle']]);
    expect(r.canChange).toBe(false);
    // perdue : la bataille attend que les troupes se refassent
    loseAllyBattle(w.diplo, 0, 100);
    r = roadView(w, ctx())!;
    expect(r.steps[1]).toMatchObject({ state: 'now', go: 'wait' });
    expect(r.steps[1].sub).toMatch(/jours/);
  });

  it('la campagne : la plage prise, le port est l’étape du moment ; une sortie rivale passe avant tout', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'war');
    w.exp.done.push(WAR_MISSION);
    applyDiplo(w.diplo, 'landing');
    campaignResult(w.diplo, 'landing', true, [12, 9], 0, 100);
    let r = roadView(w, ctx())!;
    // (au Médiéval : la plage prise, reste à tenir le camp contre la première sortie, qui vient d'elle-même)
    expect(r.steps.map((s) => s.state)).toEqual(['done', 'done', 'now', 'next', 'next', 'next']);
    expect(r.steps[2]).toMatchObject({ id: 'camp', go: 'wait' });
    expect(r.steps[2].sub).toBe('repousser la première sortie rivale');
    expect(r.notes.join(' ')).toMatch(/d’ici un jour/);
    expect(r.alert).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/21 soldats sur 25/);
    expect(r.notes.join(' ')).toMatch(/sortie rivale/);
    w.exp.clock = RAID_FIRST * 100;
    r = roadView(w, ctx())!;
    expect(r.alert).toBeTruthy();
    expect(r.steps[2].go).toBe('battle');
    expect(roadHtml(r)).toContain('dcAlert');
    // repoussée : le chapitre du Médiéval est fait, la suite s'ouvre à l'Industriel
    campaignResult(w.diplo, 'defend', true, [12, 9], w.exp.clock, 100);
    r = roadView(w, ctx())!;
    expect(r.chapters.map((c) => c.state)).toEqual(['done', 'later', 'later']);
    expect(r.steps.find((s) => s.state === 'now')).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/Chapitre fait/);
    // à l'Industriel : le port est l'étape du moment, le corps a grandi
    r = roadView(w, ctx([], 3))!;
    expect(r.chapters.map((c) => c.state)).toEqual(['done', 'now', 'later']);
    expect(r.steps.find((s) => s.state === 'now')).toMatchObject({ id: 'port', go: 'battle' });
    expect(r.notes.join(' ')).toMatch(/sur 30/);
  });

  it('la paix : les émissaires, puis l’ambassade ; les visites qui rendent les pourparlers plus sûrs', () => {
    const w = world();
    chooseAlly(w.diplo, 'asie');
    choosePath(w.diplo, 'peace');
    let r = roadView(w, ctx())!;
    expect(r.steps.map((s) => [s.id, s.state])).toEqual([['envoys', 'now'], ['truce', 'next'], ['post2', 'next'], ['embassy', 'next'], ['sign', 'next']]);
    expect(r.prep.every((p) => p.gain === 'pourparlers plus sûrs')).toBe(true);
    expect(r.prep.some((p) => p.id === 'isleSabotage')).toBe(false);
    w.exp.done.push('envoys', 'isleFair');
    r = roadView(w, ctx())!;
    expect(r.steps.map((s) => s.state)).toEqual(['done', 'now', 'next', 'next', 'next']);
    // (une visite faite passe en bas, cochée)
    expect(r.prep.at(-1)).toMatchObject({ id: 'isleFair', done: true });
    expect(r.canChange).toBe(true);
    // la trêve : plus de changement de voie ; à l'Industriel, un second comptoir (bouton qui le prend en main)
    applyDiplo(w.diplo, 'truce');
    expect(roadView(w, ctx())!.canChange).toBe(false);
    // (plus de pourparlers : plus de visites pour les rendre plus sûrs)
    expect(roadView(w, ctx())!.prep).toEqual([]);
    let n = 1;
    const count = (k: string) => (k === 'tradepost' ? n : 0);
    r = roadView(w, { ...ctx([], 3), count })!;
    expect(r.steps.find((s) => s.state === 'now')).toMatchObject({ id: 'post2', go: 'build', kind: 'tradepost' });
    expect(roadHtml(r)).toContain('data-a="build" data-k="tradepost"');
    n = 2;
    r = roadView(w, { ...ctx([], 4), count })!;
    expect(r.steps.find((s) => s.state === 'now')).toMatchObject({ id: 'embassy', go: 'build' });
    r = roadView(w, { ...ctx([], 4), count: (k) => (k === 'embassy' ? 1 : 2) })!;
    expect(r.steps.find((s) => s.state === 'now')).toMatchObject({ id: 'sign', go: 'sign' });
    expect(roadHtml(r)).toContain('data-a="sign"');
  });

  it('ce que rapporte chaque visite pour la guerre se lit dans ses gains', () => {
    const smiths = ISLE_MISSIONS.find((m) => m.id === 'isleSmiths')!;
    expect(prepGain(smiths, 'war')).toBe('+3 soldats');
    expect(prepGain(smiths, 'peace')).toBe('');
  });

  it('la fenêtre : titre, étapes numérotées, bouton de l’étape du moment, visites, changer de voie, sans point-virgule', () => {
    const w = world();
    chooseAlly(w.diplo, 'orient');
    choosePath(w.diplo, 'war');
    const html = roadHtml(roadView(w, ctx())!);
    expect(html).toContain('La voie de la guerre');
    expect(html).toContain(`data-a="mission" data-id="${WAR_MISSION}"`);
    expect(html).toContain('Pour se préparer');
    expect(html).toContain('data-a="change"');
    expect(html.replace(/<[^>]*>|&[a-z]+;/g, '')).not.toContain(';');
  });
});
