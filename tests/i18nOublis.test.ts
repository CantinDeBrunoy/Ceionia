import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { tr, pct, setLang } from '../src/i18n';
import '../src/i18n/en';
import { World } from '../src/world/world';
import { planRoad } from '../src/build/freeRoad';
import { validate } from '../src/save/save';

/** mots français courants : s'ils restent dans un texte anglais, une traduction manque */
const FRENCH = /\b(le|la|les|des|du|une|et|ou|pour|vous|votre|vos|pas|est|sont|avec|dans|sur|au|aux|retour|bon|ici|vers|sous|colons|tout|cette)\b|[àâçéèêëîïôûùü]/i;

/** les textes jadis écrits en français sans passer par tr() (voir src/main.ts, homeButton, spaceViews, voyageArt, emergency, freeRoad, save) */
const OUBLIS: [string, Record<string, string | number>?][] = [
  ['Retourner au village'],
  ['Ramener la vue sur la grande place (touche V)'],
  ['Bon retour dans votre village !'],
  ['Choisissez un bâtiment dans « Bâtir » ou sculptez le terrain.'],
  ['Commencez par « {name} », la place au centre du village (Bâtir › Vie & culture).', { name: 'Square' }],
  ['Passage du portail…'], ['Retour à la surface…'], ['Descente sous terre…'],
  ['La terre tremble : un volcan se réveille… Cliquez ici pour le voir.'],
  ['Tout le village sort dire adieu aux colons !'],
  ['🚂 Ligne modifiée : {line}.', { line: 'A' }], ['🚂 Ligne ouverte : {line}.', { line: 'A' }],
  ['Le volcan entre en éruption !'],
  ['Route libre : un clic au point A, un clic au point B.'], ['Route en ligne : glissez, case par case.'],
  ['Le brouillard se lève.'], ['Passer ›'],
  ['Descente vers {where}… altitude {alt} m', { where: 'les grands cratères', alt: 120 }],
  ['Contact ! Le module s’est posé.'], ['L’écoutille s’ouvre, l’astronaute descend l’échelle…'],
  ['« Un petit pas pour un habitant… »'], ['« … un grand bond pour le village ! »'],
  ['Le vaisseau colonial file vers l’étoile voisine…'], ['Le vaisseau colonial quitte la planète du village…'],
  ['Allumage du moteur expérimental…'], ['L’espace se plie : l’étoile voisine est déjà là !'],
  ['Des années de voyage entre les étoiles…'], ['Dans les serres de l’arche, les graines du nouveau village attendent.'],
  ['La planète bleue de l’étoile voisine !'], ['Descente vers la plaine, à l’aube…'], ['Contact ! L’arche s’est posée.'],
  ['La rampe s’ouvre : les colons foulent leur nouvelle planète.'], ['Ils allument leur premier feu de camp : un nouveau village est né.'],
  ['L’ambulance arrive, sirène hurlante'], ['Les ambulanciers accourent avec la civière'], ['Premiers soins au blessé'], ['On l’emporte sur la civière'],
  ['La police accourt'], ['Les agents frappent à la porte'], ['Le cambrioleur s’enfuit par la rue !'], ['Rattrapé : il lève les mains'], ['On l’emmène au poste'],
  ['Un habitant a fait un malaise'], ['Cambriolage'],
  ['🚑 Un habitant a fait un malaise : l’ambulance arrive'], ['🚓 Cambriolage signalé : la police arrive'],
  ['Hors de la carte.'], ['Trop loin : une route libre fait au plus {n} cases.', { n: 80 }],
  ['On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde.'],
  ['Pas de passage : des bâtiments, l’eau profonde ou des pentes trop raides barrent le chemin.'], ['Pas de passage.'],
  ['Fichier de sauvegarde invalide'],
  ['Sauvegarde d’une carte qui n’existe plus (seul le continent reste)'], ['Sauvegarde d’une ancienne version (carte plus petite)'],
];

describe('anglais : les textes jadis oubliés', () => {
  afterAll(() => setLang('fr', false));

  it('chaque texte oublié a une traduction sans mot français courant', () => {
    setLang('en', false);
    const bad = OUBLIS.map(([fr, p]) => tr(fr, p?.where ? { ...p, where: tr(String(p.where)) } : p)).filter((s) => FRENCH.test(s));
    expect(bad).toEqual([]);
    setLang('fr', false);
    expect(tr('Retourner au village')).toBe('Retourner au village');
  });

  it('pourcentage : espace en français, collé en anglais', () => {
    setLang('fr', false);
    expect(pct(20)).toBe('20 %');
    setLang('en', false);
    expect(pct(20)).toBe('20%');
  });

  it('les refus de la route libre et les erreurs de sauvegarde suivent la langue', () => {
    const w = new World();
    setLang('fr', false);
    expect(planRoad(w, -5, -5, 3, 3).why).toBe('Hors de la carte.');
    setLang('en', false);
    expect(planRoad(w, -5, -5, 3, 3).why).toBe('Off the map.');
    expect(() => validate(null)).toThrow('Invalid save file');
  });

  it('les fichiers corrigés ne gardent plus ces textes bruts hors de tr()', () => {
    const src = (f: string) => readFileSync(f, 'utf8');
    expect(src('src/ui/homeButton.ts')).toContain("tr('Retourner au village')");
    expect(src('src/ui/homeButton.ts')).not.toMatch(/\}Retourner au village/);
    const main = src('src/main.ts');
    expect(main).toContain("trx('Bon retour dans votre village !')");
    expect(src('src/ui/spaceViews.ts')).toContain("tr('En direct de la Lune')");
  });
});
