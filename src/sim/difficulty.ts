/**
 * Difficulté d'une partie : choisie en la commençant, sauvegardée avec elle (une sauvegarde d'avant les difficultés, ou d'une
 * partie en « Défi », mode retiré, se relit en « Normal »). Tous les paramètres sont dans la table `DIFFICULTY`, tous les
 * textes dans `DIFF_TEXT`
 */

export type Difficulty = 'sandbox' | 'normal';

export const DIFFICULTIES: Difficulty[] = ['sandbox', 'normal'];

export interface DifficultyRules {
  /** ressources : true illimitées (rien ne se paie), null selon le réglage « Ressources » */
  unlimited: boolean | null;
  /** bois et pierre au départ d'une nouvelle partie */
  startWood: number;
  startStone: number;
}

/** La table des difficultés : c'est ici qu'on les règle */
export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  sandbox: { unlimited: true, startWood: 60, startStone: 60 },
  normal: { unlimited: null, startWood: 60, startStone: 60 },
};

export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);

/** Difficulté lue d'une sauvegarde : une ancienne, qui n'en a pas (ou en « Défi », retiré), se joue en partie normale */
export const readDifficulty = (v: unknown): Difficulty => (isDifficulty(v) ? v : 'normal');

/** Règles d'une difficulté (Normal pour une valeur inconnue) */
export const rulesOf = (d: Difficulty) => DIFFICULTY[d] ?? DIFFICULTY.normal;

/** Textes de la difficulté, réunis ici pour la traduction */
export const DIFF_TEXT = {
  name: { sandbox: 'Bac à sable', normal: 'Normal' } as Record<Difficulty, string>,
  icon: { sandbox: 'palette', normal: 'house' } as Record<Difficulty, string>,
  tagline: {
    sandbox: 'Bâtir en paix',
    normal: 'Le village tel qu’il est',
  } as Record<Difficulty, string>,
  points: {
    sandbox: ['Tout est gratuit : bois, pierre et minerai ne manquent jamais', 'Personne ne meurt de faim ni ne quitte le village', 'Pour créer et sculpter sans compter'],
    normal: ['Les grands bâtiments se paient en bois et en pierre', 'Les petits restent gratuits', 'Le village grandit quand ses besoins sont comblés'],
  } as Record<Difficulty, string[]>,
  /** les points clés en une phrase, pour l'écran d'accueil sur téléphone */
  summary: {
    sandbox: 'Tout est gratuit et personne ne souffre : pour créer et sculpter sans compter.',
    normal: 'Les grands bâtiments se paient en bois et en pierre, les petits sont gratuits. Le village grandit quand ses besoins sont comblés.',
  } as Record<Difficulty, string>,
  /** bouton de l'écran d'accueil qui lance une nouvelle partie dans ce mode */
  play: (d: Difficulty) => `Jouer en ${DIFF_TEXT.name[d]}`,
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
  resForced: { sandbox: 'Illimitées (bac à sable)' } as Partial<Record<Difficulty, string>>,
  resInfinite: { sandbox: 'bac à sable', normal: 'réglage' } as Record<Difficulty, string>,
};
