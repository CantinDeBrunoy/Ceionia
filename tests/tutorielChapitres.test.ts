import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { TUTO_TEXT, parseState, setAside, chapterDue, stepIndex, viewKeys, startsOn, retired, type TutoState } from '../src/ui/tutorial';
import { CHAPTER_TEXT, chapterTexts, chapters } from '../src/ui/tutorialChapters';
import { i18nEntries, setLang } from '../src/i18n';
import '../src/i18n/en';

/** les étapes de la suite principale, dans l'ordre du jeu (voir `Tutorial`) */
const IDS = ['welcome', 'camera', 'fire', 'habitat', 'food', 'road', 'time', 'ages', 'gear', 'expeditions'];

describe('tutoriel : l’état enregistré', () => {
  it('lit les anciens états (on, step) et les nouveaux, refuse le reste', () => {
    expect(parseState({ on: false, step: 3 })).toEqual({ on: false, step: 3 });
    expect(parseState({ on: true, step: 2.7, id: 'road', end: 'skip', seen: ['pve', 7], ch: { id: 'hell', step: 1 } }))
      .toEqual({ on: true, step: 2, id: 'road', end: 'skip', seen: ['pve'], ch: { id: 'hell', step: 1 } });
    expect(parseState({ on: false, step: 0, end: 'peut-être', ch: { id: 'lune', step: 0 } })).toEqual({ on: false, step: 0 });
    // désactivé à l'accueil : gardé ; une autre valeur que true est ignorée
    expect(parseState({ on: false, step: 0, end: 'skip', off: true })).toEqual({ on: false, step: 0, end: 'skip', off: true });
    expect(parseState({ on: true, step: 0, off: 'oui' })).toEqual({ on: true, step: 0 });
    expect(parseState(null)).toBeNull();
    expect(parseState({ step: 3 })).toBeNull();
    expect(parseState('on')).toBeNull();
  });

  it('distingue le tutoriel fini du tutoriel mis de côté, anciens états compris', () => {
    // ancien état : finir revenait à la première étape, « Passer » gardait l'étape où l'on était
    expect(setAside({ on: false, step: 0 })).toBe(false);
    expect(setAside({ on: false, step: 6 })).toBe(true);
    // nouvel état : `end` le dit
    expect(setAside({ on: false, step: 0, end: 'skip' })).toBe(true);
    expect(setAside({ on: false, step: 0, end: 'done' })).toBe(false);
    // en cours, ou jamais choisi
    expect(setAside({ on: true, step: 4 })).toBe(false);
    expect(setAside(null)).toBe(false);
  });

  it('arrêté sur l’étape des incidents, retirée : le tutoriel est fini', () => {
    expect(retired({ on: true, step: 14, id: 'incidents', seen: ['pve'] })).toEqual({ on: false, step: 0, id: undefined, end: 'done', seen: ['pve'] });
    // un ancien état sans identifiant : la 14e étape d'alors
    expect(retired({ on: true, step: 13 })).toMatchObject({ on: false, end: 'done' });
    // ailleurs, rien ne change
    const s: TutoState = { on: true, step: 13, id: 'expeditions' };
    expect(retired(s)).toBe(s);
    expect(retired({ on: false, step: 0, id: 'incidents', end: 'skip' })).toMatchObject({ end: 'skip' });
    expect(retired(null)).toBeNull();
  });

  it('reprend à la bonne étape, même arrêté sur une étape retirée depuis', () => {
    // un ancien état sans identifiant : le numéro d'avant « Les ressources »
    expect(IDS[stepIndex({ on: true, step: 7 }, IDS)]).toBe('road');
    expect(IDS[stepIndex({ on: true, step: 12 }, IDS)]).toBe('gear');
    // le bois et la pierre se posent avec la nourriture ; les ressources et les besoins ne se lisent plus
    expect(IDS[stepIndex({ on: true, step: 6 }, IDS)]).toBe('food');
    expect(IDS[stepIndex({ on: true, step: 99, id: 'wood' }, IDS)]).toBe('food');
    expect(IDS[stepIndex({ on: true, step: 99, id: 'resources' }, IDS)]).toBe('road');
    expect(IDS[stepIndex({ on: true, step: 99, id: 'needs' }, IDS)]).toBe('time');
    // un état récent garde l'identifiant de l'étape
    expect(IDS[stepIndex({ on: true, step: 99, id: 'ages' }, IDS)]).toBe('ages');
    expect(stepIndex({ on: true, step: 99, id: 'inconnue' }, IDS)).toBe(IDS.length - 1);
  });

  it('la suite principale est courte : dix étapes (le 17 nov. 2026, elle en avait quatorze)', () => {
    expect(Object.keys(TUTO_TEXT.steps)).toEqual(IDS);
    expect(IDS.length).toBe(10);
  });
});

describe('tutoriel : les chapitres', () => {
  const done: TutoState = { on: false, step: 0, end: 'done' };

  it('se lancent une seule fois, même le tutoriel fini', () => {
    expect(chapterDue(done, 'pve')).toBe(true);
    expect(chapterDue({ ...done, seen: ['pve'] }, 'pve')).toBe(false);
    expect(chapterDue({ ...done, seen: ['pve'] }, 'hell')).toBe(true);
    // pendant le tutoriel principal aussi (il reprend après le chapitre)
    expect(chapterDue({ on: true, step: 9 }, 'hell')).toBe(true);
    // un joueur qui n'a encore rien choisi, ou un ancien tutoriel fini
    expect(chapterDue(null, 'pve')).toBe(true);
    expect(chapterDue({ on: false, step: 0 }, 'pve')).toBe(true);
  });

  it('se taisent si le joueur a mis le tutoriel de côté', () => {
    expect(chapterDue({ on: false, step: 3, end: 'skip' }, 'pve')).toBe(false);
    expect(chapterDue({ on: false, step: 0, end: 'skip' }, 'hell')).toBe(false);
    // ancien état passé en cours de route
    expect(chapterDue({ on: false, step: 5 }, 'pve')).toBe(false);
  });

  it('l’or des voisins se lance même le tutoriel passé (un mécanisme neuf), pas s’il est désactivé à l’accueil', () => {
    expect(chapterDue({ on: false, step: 3, end: 'skip' }, 'arch')).toBe(true);
    expect(chapterDue({ on: false, step: 0, end: 'skip', off: true }, 'arch')).toBe(false);
    expect(chapterDue({ on: false, step: 0, end: 'done', seen: ['arch'] }, 'arch')).toBe(false);
    expect(chapterDue(null, 'arch')).toBe(true);
  });

  it('l’or des voisins : un port chez soi, un port et le comptoir chez l’allié, puis à quoi sert l’or', () => {
    const A = CHAPTER_TEXT.arch;
    // le but dès la première étape : un port chez soi et un chez l'allié
    expect(A.home.text).toMatch(/port chez vous.*port chez eux/);
    expect(A.home.tasks).toHaveLength(2);
    expect(A.allyHarbor.text).toMatch(/\{harbor\}/);
    expect(A.allyHarbor.text).toMatch(/\{isle\}/);
    expect(A.post.text).toMatch(/\{post\}/);
    expect(A.gold.text).toMatch(/\{a\}.*\{b\}.*\{c\}/);
  });

  it('chaque étape tient en une phrase courte', () => {
    const all = chapterTexts();
    expect(all.length).toBe(21); // (aux Enfers : « Se déplacer », « Revenir au camp », « Le camp de base » et « Des renforts » s'ajoutent ; la première ligne de train : 6 étapes)
    for (const st of all) {
      expect(st.text.length, st.title).toBeLessThan(120);
      expect(st.text.replace(/«[^»]*»/g, '').slice(0, -1).includes('. '), st.title).toBe(false);
    }
  });

  it('le chapitre de l’île dit d’abord de bâtir la caserne sur l’île, pas au village ; puis d’envoyer les soldats aux Enfers', () => {
    const first = CHAPTER_TEXT.pve.defenses.text;
    expect(first).toMatch(/\{barracks\}/);
    expect(CHAPTER_TEXT.pve.send.text).toMatch(/Envoyer aux Enfers/);
    expect(first).toMatch(/sur son île, pas au village/);
  });

  it('le tutoriel principal ne lit rien du PvE : les chapitres sont à part', () => {
    const src = readFileSync('src/ui/tutorial.ts', 'utf8');
    expect(src).not.toMatch(/war\.|isleDefenses|hellWhy|invasion/);
  });
});

describe('tutoriel : les touches de la vue', () => {
  it('suivent la langue quand la disposition du clavier est inconnue', () => {
    expect(viewKeys(null, 'fr')).toEqual({ move: ['Z', 'Q', 'S', 'D'], turn: ['A', 'E'] });
    expect(viewKeys(undefined, 'en')).toEqual({ move: ['W', 'A', 'S', 'D'], turn: ['Q', 'E'] });
  });

  it('suivent la vraie disposition quand le navigateur la donne', () => {
    const azerty = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyQ', 'a'], ['KeyE', 'e']]);
    expect(viewKeys(azerty, 'en')).toEqual({ move: ['Z', 'Q', 'S', 'D'], turn: ['A', 'E'] });
    const qwerty = new Map([['KeyW', 'w'], ['KeyA', 'a'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyQ', 'q'], ['KeyE', 'e']]);
    expect(viewKeys(qwerty, 'fr')).toEqual({ move: ['W', 'A', 'S', 'D'], turn: ['Q', 'E'] });
    // une touche sans lettre (ou du HTML) : la lettre de la langue
    expect(viewKeys(new Map([['KeyW', '<'], ['KeyE', '']]), 'fr')).toEqual({ move: ['Z', 'Q', 'S', 'D'], turn: ['A', 'E'] });
  });
});

describe('tutoriel : les nouveaux textes ont leur anglais', () => {
  afterAll(() => setLang('fr', false));

  it('chapitres, ressources, clavier', () => {
    const en = i18nEntries();
    const fr = [
      ...chapterTexts().flatMap((s) => [s.title, s.text, ...s.tasks]),
      CHAPTER_TEXT.pve.title, CHAPTER_TEXT.pve.goIsle, CHAPTER_TEXT.pve.command, CHAPTER_TEXT.hell.title,
      CHAPTER_TEXT.pve.defenses.village, CHAPTER_TEXT.pve.send.wait, CHAPTER_TEXT.hell.pick.none,
      CHAPTER_TEXT.arch.title, CHAPTER_TEXT.arch.goAlly, CHAPTER_TEXT.arch.gold.how, CHAPTER_TEXT.arch.arrow, CHAPTER_TEXT.arch.arrowBack,
      TUTO_TEXT.steps.food.title, TUTO_TEXT.steps.food.text, TUTO_TEXT.skipChapter,
    ];
    expect(fr.filter((s) => !en.has(s))).toEqual([]);
    setLang('en', false);
    expect(TUTO_TEXT.steps.camera.keys('WASD', 'Q / E')).toBe('Keyboard: WASD move the view, Q / E turn it.');
    expect(CHAPTER_TEXT.hell.title).toBe('Hell');
  });
});

describe('démarrage du tutoriel', () => {
  it('une nouvelle partie le relance, même fini ou passé ailleurs, sauf s’il est désactivé à l’accueil', () => {
    expect(startsOn(null, true)).toBe(true);
    expect(startsOn({ on: false, step: 0, end: 'done' }, true)).toBe(true);
    expect(startsOn({ on: false, step: 4, end: 'skip' }, true)).toBe(true);
    expect(startsOn({ on: false, step: 0, end: 'skip', off: true }, true)).toBe(false);
  });
  it('une partie reprise garde son état', () => {
    expect(startsOn({ on: false, step: 4, end: 'skip' }, false)).toBe(false);
    expect(startsOn({ on: true, step: 4 }, false)).toBe(true);
    expect(startsOn(null, false)).toBe(false);
  });

  it('les Enfers : où attaquer, choisir, se déplacer, attaquer, revenir au camp ; chaque geste attend d’être fait', () => {
    let order: { kind: string } | null = null, retreats = 0, selected = 0;
    const h = { root: { querySelector: () => null }, age: () => 1, mode: () => 'hell', selected: () => selected, lastOrder: () => order, retreats: () => retreats } as never;
    const steps = chapters({ clicked: () => false } as never, {} as never, h).hell.steps;
    expect(steps.map((s) => s.id)).toEqual(['hellGoal', 'hellPick', 'hellMove', 'hellAttack', 'hellRetreat', 'hellCamp', 'hellRecruit', 'hellBack']);
    const by = (id: string) => steps.find((s) => s.id === id)!;
    // choisir
    expect(by('hellPick').check()).toEqual([false]);
    selected = 3;
    expect(by('hellPick').check()).toEqual([true]);
    // un clic droit au sol : une marche (une attaque ne compte pas pour cette étape)
    by('hellMove').begin!();
    order = { kind: 'attack' };
    expect(by('hellMove').check()).toEqual([false]);
    order = { kind: 'move' };
    expect(by('hellMove').check()).toEqual([true]);
    // un clic droit sur la cible
    by('hellAttack').begin!();
    expect(by('hellAttack').check()).toEqual([false]);
    order = { kind: 'attack' };
    expect(by('hellAttack').check()).toEqual([true]);
    // R : le repli au camp
    by('hellRetreat').begin!();
    expect(by('hellRetreat').check()).toEqual([false]);
    retreats++;
    expect(by('hellRetreat').check()).toEqual([true]);
    const E = CHAPTER_TEXT.hell;
    expect(E.pick.text).toMatch(/glissez un cadre/);
    expect(E.move.text).toMatch(/clic droit/);
    expect(E.retreat.text).toMatch(/touche R/);
  });
});
