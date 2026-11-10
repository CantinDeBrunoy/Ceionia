import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { TUTO_TEXT, parseState, setAside, chapterDue, stepIndex, viewKeys, type TutoState } from '../src/ui/tutorial';
import { CHAPTER_TEXT, chapterTexts } from '../src/ui/tutorialChapters';
import { i18nEntries, setLang } from '../src/i18n';
import '../src/i18n/en';

/** les étapes de la suite principale, dans l'ordre du jeu (voir `Tutorial`) */
const IDS = ['welcome', 'camera', 'fire', 'habitat', 'food', 'wood', 'stone', 'resources', 'road', 'needs', 'time', 'ages', 'expeditions', 'gear', 'incidents'];

describe('tutoriel : l’état enregistré', () => {
  it('lit les anciens états (on, step) et les nouveaux, refuse le reste', () => {
    expect(parseState({ on: false, step: 3 })).toEqual({ on: false, step: 3 });
    expect(parseState({ on: true, step: 2.7, id: 'road', end: 'skip', seen: ['pve', 7], ch: { id: 'hell', step: 1 } }))
      .toEqual({ on: true, step: 2, id: 'road', end: 'skip', seen: ['pve'], ch: { id: 'hell', step: 1 } });
    expect(parseState({ on: false, step: 0, end: 'peut-être', ch: { id: 'lune', step: 0 } })).toEqual({ on: false, step: 0 });
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

  it('reprend à la bonne étape malgré l’étape « Les ressources » ajoutée', () => {
    // un ancien état à « Les routes » (8e étape d'alors) reprend aux routes, pas aux ressources
    expect(IDS[stepIndex({ on: true, step: 7 }, IDS)]).toBe('road');
    expect(IDS[stepIndex({ on: true, step: 13 }, IDS)]).toBe('incidents');
    expect(IDS[stepIndex({ on: true, step: 6 }, IDS)]).toBe('stone');
    // un nouvel état garde l'identifiant de l'étape
    expect(IDS[stepIndex({ on: true, step: 99, id: 'resources' }, IDS)]).toBe('resources');
    expect(stepIndex({ on: true, step: 99, id: 'inconnue' }, IDS)).toBe(IDS.length - 1);
  });

  it('la suite principale du jeu a ces étapes, « Les ressources » après les premières constructions', () => {
    expect(Object.keys(TUTO_TEXT.steps)).toEqual(IDS);
    expect(IDS.indexOf('resources')).toBeGreaterThan(IDS.indexOf('stone'));
    expect(IDS.indexOf('resources')).toBeLessThan(IDS.indexOf('needs'));
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

  it('chaque étape tient en une phrase courte', () => {
    const all = chapterTexts();
    expect(all.length).toBe(8);
    for (const st of all) {
      expect(st.text.length, st.title).toBeLessThan(120);
      expect(st.text.replace(/«[^»]*»/g, '').slice(0, -1).includes('. '), st.title).toBe(false);
    }
  });

  it('le chapitre de l’île dit d’abord de bâtir les défenses sur l’île, pas au village', () => {
    const first = CHAPTER_TEXT.pve.defenses.text;
    expect(first).toMatch(/\{tower\}/);
    expect(first).toMatch(/\{barracks\}/);
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
      CHAPTER_TEXT.pve.defenses.village, CHAPTER_TEXT.pve.orders.wait, CHAPTER_TEXT.hell.pick.none,
      TUTO_TEXT.steps.resources.title, TUTO_TEXT.steps.resources.text, TUTO_TEXT.skipChapter,
    ];
    expect(fr.filter((s) => !en.has(s))).toEqual([]);
    setLang('en', false);
    expect(TUTO_TEXT.steps.camera.keys('WASD', 'Q / E')).toBe('Keyboard: WASD move the view, Q / E turn it.');
    expect(CHAPTER_TEXT.hell.title).toBe('Hell');
  });
});
