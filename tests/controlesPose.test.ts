import { describe, it, expect, beforeEach } from 'vitest';
import { fold, matches } from '../src/ui/search';
import { guessLayout, layoutKeys, loadControls, saveControls, CONTROLS_KEY } from '../src/core/controls';
import { orientable, sideToward } from '../src/build/placement';
import { World, N, setMapSize, VEG_CAVE } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { KINDS } from '../src/build/catalog';
import { bothOf, bothLangs } from '../src/i18n';
import '../src/i18n/data';
import '../src/i18n/en';

describe('recherche des menus', () => {
  it('ignore accents, majuscules et ligatures', () => {
    expect(fold('Église')).toBe('eglise');
    expect(fold('Œuvre d’art')).toBe("oeuvre d'art");
    expect(matches('eglise', ['Église'])).toBe(true);
    expect(matches('EGL', ['église'])).toBe(true);
    expect(matches('', ['quoi que ce soit'])).toBe(true);
  });
  it('chaque mot tapé doit se trouver dans l’un des textes', () => {
    expect(matches('point eau', ['Point d’eau'])).toBe(true);
    expect(matches('point feu', ['Point d’eau'])).toBe(false);
    expect(matches('maison bois', ['Maison', 'Bois'])).toBe(true);
    // un début de mot, pas un morceau au milieu
    expect(matches('bou', ['Boulangerie'])).toBe(true);
    expect(matches('eau', ['Château'])).toBe(false);
  });
  it('un bâtiment se trouve par son nom français ou anglais, à tous les âges', () => {
    const names = bothOf(KINDS.house, 'names');
    expect(names).toContain('Hutte');
    expect(names.some((n) => /hut/i.test(n) && n !== 'Hutte')).toBe(true);
    expect(matches('hutte', names)).toBe(true);
    expect(bothLangs('Nourriture')).toEqual(['Nourriture', 'Food']);
  });
});

describe('contrôles de la vue', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  });
  it('rien de choisi au premier lancement, puis le choix est retenu', () => {
    expect(loadControls()).toBeNull();
    saveControls({ mode: 'mouse', layout: 'qwerty' });
    expect(loadControls()).toEqual({ mode: 'mouse', layout: 'qwerty' });
  });
  it('une valeur abîmée compte comme rien de choisi', () => {
    store.set(CONTROLS_KEY, '{"mode":"joystick"}');
    expect(loadControls()).toBeNull();
    store.set(CONTROLS_KEY, 'pas du json');
    expect(loadControls()).toBeNull();
  });
  it('la disposition : celle du navigateur, sinon celle de la langue', () => {
    expect(guessLayout('en', new Map([['KeyW', 'z']]))).toBe('azerty');
    expect(guessLayout('fr', new Map([['KeyW', 'w']]))).toBe('qwerty');
    expect(guessLayout('fr', null)).toBe('azerty');
    expect(guessLayout('en')).toBe('qwerty');
    expect(layoutKeys('azerty').move.join('')).toBe('ZQSD');
    expect(layoutKeys('qwerty').move.join('')).toBe('WASD');
  });
});

describe('pose en deux clics', () => {
  it('les bâtiments à porte se tournent, sauf ceux que l’eau oriente', () => {
    expect(orientable('house')).toBe(true);
    expect(orientable('gather')).toBe(false);
    expect(orientable('lamp')).toBe(false);
    expect(orientable('harbor')).toBe(false);
    expect(orientable('pier')).toBe(false);
  });
  it('le côté de l’entrée suit la souris ; près du centre, aucun', () => {
    // emprise de 2 × 2 centrée en (10, 10) : FRONT = +z, +x, -z, -x
    expect(sideToward(10, 10, 2, 10.2, 13)).toBe(0);
    expect(sideToward(10, 10, 2, 13, 9.5)).toBe(1);
    expect(sideToward(10, 10, 2, 10, 7)).toBe(2);
    expect(sideToward(10, 10, 2, 7, 10.4)).toBe(3);
    expect(sideToward(10, 10, 2, 10.3, 10.2)).toBe(-1);
  });
  it('une grotte tournée garde son cap à la sauvegarde ; les anciennes parties gardent le leur', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    // une case où une grotte tient
    let cell = -1;
    for (let k = N * 40 + 40; k < N * N - N * 40 && cell < 0; k++) if (w.veg[k] < VEG_CAVE && w.decorFits(k % N, Math.floor(k / N), VEG_CAVE)) cell = k;
    expect(cell).toBeGreaterThan(0);
    const cx = cell % N, cz = Math.floor(cell / N);
    const before = w.caveFrame(cx, cz).yaw;
    w.caveYaw.set(cell, 1.23);
    expect(w.setVeg(cx, cz, VEG_CAVE)).toBe(true);
    expect(w.caveFrame(cx, cz).yaw).toBeCloseTo(1.23);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    const back = new World();
    back.fromJSON(d);
    expect(back.caveFrame(cx, cz).yaw).toBeCloseTo(1.23);
    // une sauvegarde d'avant (sans `caveYaw`) : la grotte s'ouvre vers le bas de la pente, comme avant
    delete d.caveYaw;
    const old = new World();
    old.fromJSON(d);
    expect(old.caveYaw.size).toBe(0);
    expect(old.caveFrame(cx, cz).yaw).toBeCloseTo(before);
  });
});
