/**
 * Difficulté d'une partie : choisie en la commençant, sauvegardée avec elle. Trois modes : « Bac à sable », « Facile » (les
 * règles de l'ancien « Normal » : seuls les grands bâtiments se paient) et « Normal » (l'ancien « Défi », mode par défaut).
 * Les anciennes sauvegardes se relisent avec `readDifficulty` (voir `DIFF_VERSION`). Tous les paramètres sont dans la table
 * `DIFFICULTY`, tous les textes dans `DIFF_TEXT`
 */

import { tr } from '../i18n';

export type Difficulty = 'sandbox' | 'easy' | 'normal';

export const DIFFICULTIES: Difficulty[] = ['sandbox', 'easy', 'normal'];

/** Difficulté d'une nouvelle partie quand le joueur n'en choisit pas */
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

/**
 * Version du nom des difficultés dans la sauvegarde. Avant (absente) : « normal » était le mode facile d'aujourd'hui et
 * « challenge » (le Défi) le mode normal d'aujourd'hui ; depuis la version 1, les noms sont ceux d'aujourd'hui
 */
export const DIFF_VERSION = 1;

/** Barème des prix : bois et pierre par côté d'emprise (un 2 × 2 paie double, un 3 × 3 triple), plus un supplément par âge */
export interface Price {
  wood: number;
  woodAge: number;
  stone: number;
  stoneAge: number;
  /** pierre des enclos et des écuries, qui n'en demandent presque pas */
  penStone: number;
  penStoneAge: number;
}

export interface DifficultyRules {
  /** ressources : true illimitées (rien ne se paie), false toujours comptées, null selon le réglage « Ressources » */
  unlimited: boolean | null;
  /** barème de chaque bâtiment, petits compris ; null : celui de la partie normale (seuls les grands se paient) */
  price: Price | null;
  /** bois et pierre au départ d'une nouvelle partie */
  startWood: number;
  startStone: number;
  /** nourriture que mange chaque habitant (1 : comme en partie normale) */
  foodK: number;
  /** disette : part des habitants qui quittent le village par seconde de jeu quand la nourriture manque tout à fait (en proportion du manque) ; 0 : personne ne part */
  famine: number;
  /** vitesse de croissance du village (1 : normale) */
  growK: number;
  /** après un besoin non comblé, la croissance reste ralentie (facteur `recoverK`) pendant `recoverT` secondes de jeu */
  recoverK: number;
  recoverT: number;
  /** risque des expéditions (1 : normal) */
  riskK: number;
  /**
   * conditions d'âge : seuls comptent les bâtiments bâtis depuis le dernier passage d'âge, et l'âge suivant n'en demande que ce
   * qu'il exige de plus que les âges d'avant (le passage n'offre aucun progrès vers l'âge d'après) ; false : tout le village compte
   */
  newOnly: boolean;
  /** l'équipement des expéditions se paie aussi en bois et en pierre (false : seules les pièces de métal, en minerai) */
  gearPrice: boolean;
}

/** La table des difficultés : c'est ici qu'on les règle */
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  sandbox: { unlimited: true, price: null, startWood: 60, startStone: 60, foodK: 1, famine: 0, growK: 1, recoverK: 1, recoverT: 0, riskK: 1, newOnly: false, gearPrice: false },
  easy: { unlimited: null, price: null, startWood: 60, startStone: 60, foodK: 1, famine: 0, growK: 1, recoverK: 1, recoverT: 0, riskK: 1, newOnly: false, gearPrice: false },
  normal: {
    unlimited: false,
    price: { wood: 5, woodAge: 3, stone: 3, stoneAge: 3, penStone: 1, penStoneAge: 1 },
    startWood: 50, startStone: 40,
    foodK: 1.25, famine: 0.004, growK: 0.75, recoverK: 0.5, recoverT: 100, riskK: 1.25,
    newOnly: true, gearPrice: true,
  },
};

export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

/**
 * Difficulté lue d'une sauvegarde, de version `ver` (absente : sauvegarde d'avant le changement de noms) : d'avant, « normal »
 * (ou aucune) devient « easy » et « challenge » (le Défi) devient « normal » ; depuis, les noms sont ceux d'aujourd'hui
 */
export function readDifficulty(v: unknown, ver?: unknown): Difficulty {
  if (typeof ver === 'number' && ver >= DIFF_VERSION) return isDifficulty(v) ? v : DEFAULT_DIFFICULTY;
  if (v === 'challenge' || v === 'defi') return 'normal';
  return v === 'sandbox' ? 'sandbox' : 'easy';
}

/** Règles d'une difficulté (Facile pour une valeur inconnue) */
export const rulesOf = (d: Difficulty) => DIFFICULTY[d] ?? DIFFICULTY.easy;

/** Textes de la difficulté, réunis ici pour la traduction */
const RAW = {
  name: { sandbox: 'Bac à sable', easy: 'Facile', normal: 'Normal' } as Record<Difficulty, string>,
  icon: { sandbox: 'palette', easy: 'house', normal: 'peaks' } as Record<Difficulty, string>,
  tagline: {
    sandbox: 'Bâtir en paix',
    easy: 'Pour bâtir sans se presser',
    normal: 'Chaque pierre compte',
  } as Record<Difficulty, string>,
  points: {
    sandbox: ['Tout est gratuit : bois, pierre et minerai ne manquent jamais', 'Personne ne meurt de faim ni ne quitte le village', 'Pour créer et sculpter sans compter'],
    easy: ['Les grands bâtiments se paient en bois et en pierre', 'Les petits restent gratuits', 'Le village grandit quand ses besoins sont comblés'],
    normal: [
      'Chaque bâtiment se paie, plus cher selon sa taille et l’âge', 'Pour passer d’âge, il faut bâtir du neuf : les bâtiments d’avant ne comptent pas',
      'On mange plus qu’en Facile', 'Les expéditions sont plus risquées, et leur équipement se paie',
    ],
  } as Record<Difficulty, string[]>,
  /** les points clés en une phrase, pour l'écran d'accueil sur téléphone */
  summary: {
    sandbox: 'Tout est gratuit et personne ne souffre : pour créer et sculpter sans compter.',
    easy: 'Les grands bâtiments se paient en bois et en pierre, les petits sont gratuits. Le village grandit quand ses besoins sont comblés.',
    normal: 'Tout se paie et on mange plus : chaque pierre compte. Le mode conseillé.',
  } as Record<Difficulty, string>,
  /** mode mis en avant à l'accueil */
  recommended: 'Conseillé',
  /** bouton de l'écran d'accueil qui lance une nouvelle partie dans ce mode */
  play: (d: Difficulty) => `Jouer en ${RAW.name[d]}`,
  choose: 'Choisissez la difficulté',
  chooseSub: 'Elle vaut pour toute la partie : on peut en changer en la recommençant.',
  start: 'Commencer',
  cancel: 'Annuler',
  /** une sauvegarde existe déjà pour cette carte (menu), ou la partie en cours (réglages) */
  overwrite: 'La sauvegarde de cette carte sera écrasée.',
  restart: 'Recommencer',
  restartNote: 'La partie en cours sera remplacée.',
  setting: 'Difficulté',
  settingHint: 'Choisie au début de la partie. « Recommencer cette carte » permet d’en changer.',
  /** le réglage « Ressources » est imposé par la difficulté */
  resForced: { sandbox: 'Illimitées (bac à sable)', normal: 'Comptées (mode Normal)' } as Partial<Record<Difficulty, string>>,
  resInfinite: { sandbox: 'bac à sable', easy: 'réglage', normal: 'réglage' } as Record<Difficulty, string>,
  /** en Normal, le premier producteur d'une ressource est offert, pour ne jamais rester bloqué faute de bois ou de pierre */
  firstFree: 'Offert : le premier, pour ne jamais manquer de quoi bâtir',
  famine: (fix: string) => `Disette : des habitants quittent le village faute de manger. Vite, ${fix} ou un champ.`,
  recovering: 'Le village se remet d’un manque : il grandit plus lentement pour l’instant.',
  /** condition d'âge en Normal : les bâtiments à bâtir en plus de ceux qu'avait le village en entrant dans l'âge */
  more: (name: string) => `${name} (en plus)`,
};

/** Une table de textes, traduite à chaque lecture (la langue peut changer) */
const trRec = <T extends Record<string, string>>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, tr(v)])) as T;
const trRecs = <T extends Record<string, string[]>>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map((x) => tr(x))])) as T;

/** Textes de la difficulté dans la langue courante (les dictionnaires sont dans src/i18n/en/menu.ts) */
export const DIFF_TEXT = {
  get name() { return trRec(RAW.name); },
  icon: RAW.icon,
  get tagline() { return trRec(RAW.tagline); },
  get points() { return trRecs(RAW.points); },
  get summary() { return trRec(RAW.summary); },
  get recommended() { return tr(RAW.recommended); },
  play: (d: Difficulty) => tr('Jouer en {name}', { name: tr(RAW.name[d]) }),
  get choose() { return tr(RAW.choose); },
  get chooseSub() { return tr(RAW.chooseSub); },
  get start() { return tr(RAW.start); },
  get cancel() { return tr(RAW.cancel); },
  get overwrite() { return tr(RAW.overwrite); },
  get restart() { return tr(RAW.restart); },
  get restartNote() { return tr(RAW.restartNote); },
  get setting() { return tr(RAW.setting); },
  get settingHint() { return tr(RAW.settingHint); },
  get resForced() { return trRec(RAW.resForced as Record<string, string>) as Partial<Record<Difficulty, string>>; },
  get resInfinite() { return trRec(RAW.resInfinite); },
  get firstFree() { return tr(RAW.firstFree); },
  famine: (fix: string) => tr('Disette : des habitants quittent le village faute de manger. Vite, {fix} ou un champ.', { fix }),
  get recovering() { return tr(RAW.recovering); },
  more: (name: string) => tr('{name} (en plus)', { name }),
};
