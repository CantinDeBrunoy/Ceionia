/**
 * Difficulté d'une partie : choisie en la commençant, sauvegardée avec elle (une sauvegarde d'avant les difficultés se
 * relit en « Normal »). Tous les paramètres sont dans la table `DIFFICULTY`, tous les textes dans `DIFF_TEXT`
 */

export type Difficulty = 'sandbox' | 'normal' | 'challenge';

export const DIFFICULTIES: Difficulty[] = ['sandbox', 'normal', 'challenge'];

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
}

/** La table des difficultés : c'est ici qu'on les règle */
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  sandbox: { unlimited: true, price: null, startWood: 60, startStone: 60, foodK: 1, famine: 0, growK: 1, recoverK: 1, recoverT: 0, riskK: 1 },
  normal: { unlimited: null, price: null, startWood: 60, startStone: 60, foodK: 1, famine: 0, growK: 1, recoverK: 1, recoverT: 0, riskK: 1 },
  challenge: {
    unlimited: false,
    price: { wood: 5, woodAge: 3, stone: 3, stoneAge: 3, penStone: 1, penStoneAge: 1 },
    startWood: 50, startStone: 40,
    foodK: 1.25, famine: 0.004, growK: 0.75, recoverK: 0.5, recoverT: 100, riskK: 1.25,
  },
};

export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

/** Difficulté lue d'une sauvegarde : une ancienne, qui n'en a pas, se joue en partie normale */
export const readDifficulty = (v: unknown): Difficulty => (isDifficulty(v) ? v : 'normal');

/** Règles d'une difficulté (Normal pour une valeur inconnue) */
export const rulesOf = (d: Difficulty) => DIFFICULTY[d] ?? DIFFICULTY.normal;

/** Textes de la difficulté, réunis ici pour la traduction */
export const DIFF_TEXT = {
  name: { sandbox: 'Bac à sable', normal: 'Normal', challenge: 'Défi' } as Record<Difficulty, string>,
  icon: { sandbox: 'palette', normal: 'house', challenge: 'peaks' } as Record<Difficulty, string>,
  tagline: {
    sandbox: 'Bâtir en paix',
    normal: 'Le village tel qu’il est',
    challenge: 'Chaque pierre compte',
  } as Record<Difficulty, string>,
  points: {
    sandbox: ['Tout est gratuit : bois, pierre et minerai ne manquent jamais', 'Personne ne meurt de faim ni ne quitte le village', 'Pour créer et sculpter sans compter'],
    normal: ['Les grands bâtiments se paient en bois et en pierre', 'Les petits restent gratuits', 'Le village grandit quand ses besoins sont comblés'],
    challenge: ['Chaque bâtiment se paie, plus cher selon sa taille et l’âge', 'On mange plus ; la disette fait fuir des habitants, et le village met du temps à s’en remettre', 'Les expéditions sont plus risquées'],
  } as Record<Difficulty, string[]>,
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
  resForced: { sandbox: 'Illimitées (bac à sable)', challenge: 'Comptées (défi)' } as Partial<Record<Difficulty, string>>,
  resInfinite: { sandbox: 'bac à sable', normal: 'réglage', challenge: 'réglage' } as Record<Difficulty, string>,
  /** en défi, le premier producteur d'une ressource est offert, pour ne jamais rester bloqué faute de bois ou de pierre */
  firstFree: 'Offert : le premier, pour ne jamais manquer de quoi bâtir',
  famine: (fix: string) => `Disette : des habitants quittent le village faute de manger. Vite, ${fix} ou un champ.`,
  recovering: 'Le village se remet d’un manque : il grandit plus lentement pour l’instant.',
};
