import type { World } from '../world/world';
import type { People } from '../world/archipelago';
import { tr } from '../i18n';
import { archipelagoOn, ENDGAME_AGE, PEACE_CHAIN, PEACE_MISSION, peopleName as name, rivalOf, WAR_MISSION, WAR_SPOILS } from './diplomacy';

/**
 * Le panneau « Peuples » (voir `docs/diplomatie.md`, idée de Margot, testeuse v6 : « une diplomatie que je ne vois pas
 * n'existe pas pour moi ») : une fiche par peuple de l'archipel, son humeur, son état, et les gestes qu'on peut faire avec
 * lui. Il ne fait que **lire** l'état de la diplomatie et mener aux gestes qui existent déjà (la carte de l'allié, la carte
 * de la paix ou de la guerre, les expéditions, le comptoir, l'île alliée) : aucune règle nouvelle. Les gestes pas encore
 * possibles restent visibles, grisés, avec la raison
 */

/** L'humeur d'un peuple envers nous, lue dans l'état du conflit : de 0 (hostile) à 4 (fraternel) */
export type Mood = 0 | 1 | 2 | 3 | 4;
export const MOOD_NAMES = ['Hostile', 'Méfiant', 'Neutre', 'Amical', 'Fraternel'] as const;

/**
 * Ce que mène chaque geste : `ally` la carte du choix de l'allié, `path` la carte de la paix ou de la guerre (ou la bataille,
 * `Game.openDiploChoice`), `mission` une expédition (`mission`), `trade` la fiche du comptoir, `post` bâtir le comptoir chez
 * l'allié, `visit` la vue sur une île
 */
export type GestureGo = 'ally' | 'path' | 'mission' | 'trade' | 'post' | 'visit';
export interface Gesture {
  id: 'ally' | 'trade' | 'visit' | 'scouts' | 'peace' | 'war';
  label: string;
  /** possible maintenant (le bouton mène quelque part) */
  on: boolean;
  /** déjà fait : le bouton dit comment (`why`), coché, sans rien ouvrir */
  done?: boolean;
  /** pourquoi pas encore (grisé), ou ce qui est fait */
  why?: string;
  go?: GestureGo;
  mission?: string;
}

export interface PeopleCard {
  people: People;
  role: 'free' | 'ally' | 'rival';
  mood: Mood;
  /** d'où vient l'humeur, en une phrase */
  moodWhy: string;
  /** l'état : allié, en guerre, en paix… */
  status: string;
  /** ton de l'état (couleur de la pastille) */
  tone: 'ally' | 'war' | 'peace' | 'calm';
  gestures: Gesture[];
}

export interface PeoplesView {
  /** l'archipel est-il là ? Sans lui, les peuples sont encore inconnus (deux blasons voilés et ce qui les fera venir) */
  open: boolean;
  /** sans archipel : comment les rencontrer */
  hint?: string;
  cards: PeopleCard[];
}

/** Ce que le panneau lit hors du monde : l'âge, le comptoir ouvert, l'installation chez l'allié faite, l'agrandissement possible, l'onglet des grands choix */
export interface PeoplesCtx {
  age: number; tradeOpen: boolean; postReady: boolean; canExplore: boolean;
  /** l'onglet « Grands choix » des expéditions existe (le grand choix est fait : « Explorer le monde » s'y prend encore) */
  waysTab?: boolean;
}

const ORDER: People[] = ['orient', 'asie'];

/** Pourquoi le dénouement (la paix, la guerre, les éclaireurs) ne se joue pas encore (null : il se joue) */
function endWhy(w: Pick<World, 'diplo'>, c: PeoplesCtx): string | null {
  if (!w.diplo.ally) return tr('Choisissez d’abord un allié');
  if (c.age < ENDGAME_AGE) return tr('Au Médiéval');
  if (c.age > ENDGAME_AGE && w.diplo.conflict === 'open') return null;
  if (!c.postReady) return tr('Après le port et le comptoir chez votre allié');
  return null;
}

/** Le panneau tel qu'il se montre maintenant */
export function peoplesView(w: Pick<World, 'isles' | 'diplo' | 'exp'>, c: PeoplesCtx): PeoplesView {
  if (!archipelagoOn(w)) {
    const hint = !c.canExplore ? tr('Ce monde ne peut plus s’agrandir : aucun peuple ne viendra.')
      : !c.waysTab ? tr('Au-delà de l’horizon vivent d’autres peuples. Vous pourrez partir à leur rencontre au grand choix de la fin de l’Antiquité : « Explorer le monde ».')
        : tr('Au-delà de l’horizon vivent d’autres peuples. Pour les rencontrer : « Explorer le monde », au grand choix (onglet « Grands choix » des expéditions).');
    return { open: false, hint, cards: [] };
  }
  return { open: true, cards: ORDER.map((p) => card(w, c, p)) };
}

function card(w: Pick<World, 'isles' | 'diplo' | 'exp'>, c: PeoplesCtx, p: People): PeopleCard {
  const d = w.diplo;
  if (!d.ally) {
    const no = tr('Choisissez d’abord un allié');
    return {
      people: p, role: 'free', mood: 2, moodWhy: tr('Ils vous observent : avec qui ferez-vous alliance ?'),
      status: tr('En guerre contre {other}', { other: name(rivalOf(p)) }), tone: 'war',
      gestures: [
        { id: 'ally', label: tr('Choisir pour allié'), on: true, go: 'ally' },
        { id: 'trade', label: tr('Commercer'), on: false, why: no },
        { id: 'peace', label: tr('Faire la paix'), on: false, why: no },
        { id: 'war', label: tr('Faire la guerre'), on: false, why: no },
      ],
    };
  }
  return p === d.ally ? allyCard(w, c, p) : rivalCard(w, c, p);
}

function allyCard(w: Pick<World, 'diplo'>, c: PeoplesCtx, p: People): PeopleCard {
  const d = w.diplo, over = d.conflict !== 'open';
  const trade: Gesture = c.tradeOpen ? { id: 'trade', label: tr('Commercer'), on: true, go: 'trade' }
    : c.age < 2 ? { id: 'trade', label: tr('Commercer'), on: false, why: tr('Au Médiéval : un comptoir sur leur île') }
      : { id: 'trade', label: tr('Bâtir un comptoir'), on: true, go: 'post', why: tr('On y vend nos matériaux contre de l’or') };
  return {
    people: p, role: 'ally', mood: over ? 4 : 3,
    moodWhy: over ? (d.conflict === 'treaty' ? tr('La guerre est finie : vous êtes restés à leurs côtés.') : tr('Vous les avez aidés à finir la guerre.')) : tr('Vous avez pris leur parti dans la guerre.'),
    status: over ? tr('En paix, à vos côtés') : tr('En guerre contre {other}', { other: name(rivalOf(p)) }), tone: over ? 'ally' : 'war',
    gestures: [trade, { id: 'visit', label: tr('Voir leur île'), on: true, go: 'visit', why: tr('Vous y bâtissez hors de leur ville') }],
  };
}

function rivalCard(w: Pick<World, 'diplo' | 'exp'>, c: PeoplesCtx, p: People): PeopleCard {
  const d = w.diplo, done = (id: string) => w.exp.done.includes(id);
  // l'humeur et l'état
  let mood: Mood, moodWhy: string, status: string, tone: PeopleCard['tone'];
  if (d.conflict === 'peace') { mood = 3; moodWhy = tr('La paix est signée : vos marchands sont les bienvenus.'); status = tr('En paix avec vous'); tone = 'peace'; }
  else if (d.conflict === 'treaty') { mood = 2; moodWhy = tr('Un traité a fini la guerre entre les deux îles.'); status = tr('En paix (traité)'); tone = 'peace'; }
  else if (d.conflict === 'won') { mood = 1; moodWhy = tr('Vaincus, ils vous paient tribut.'); status = tr('Vaincus : {n} or de tribut par jour', { n: WAR_SPOILS.tribute }); tone = 'calm'; }
  else if (d.path === 'war') { mood = 0; moodWhy = tr('Vous préparez la guerre contre eux.'); status = tr('En guerre contre vous'); tone = 'war'; }
  else if (d.post) { mood = 2; moodWhy = tr('Vos émissaires les ont apaisés : ils écoutent.'); status = tr('En guerre contre votre allié'); tone = 'war'; }
  else { mood = 1; moodWhy = tr('Vous êtes l’allié de leur ennemi.'); status = tr('En guerre contre votre allié'); tone = 'war'; }

  // les gestes : la paix, la guerre, les éclaireurs
  const why = endWhy(w, c);
  let peace: Gesture, war: Gesture, scouts: Gesture;
  if (d.conflict !== 'open') {
    const how = d.conflict === 'peace' ? tr('La paix est signée') : d.conflict === 'won' ? tr('La guerre est gagnée') : tr('Un traité a fini la guerre');
    peace = { id: 'peace', label: tr('Faire la paix'), on: false, done: d.conflict !== 'won', why: d.conflict === 'won' ? tr('La guerre est gagnée') : how };
    war = { id: 'war', label: tr('Faire la guerre'), on: false, done: d.conflict === 'won', why: d.conflict === 'won' ? how : tr('Le conflit est réglé') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, done: done(WAR_MISSION), why: done(WAR_MISSION) ? tr('Leur côte est reconnue') : tr('Le conflit est réglé') };
  } else if (why) {
    peace = { id: 'peace', label: tr('Faire la paix'), on: false, why };
    war = { id: 'war', label: tr('Faire la guerre'), on: false, why };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('{why}, puis la voie de la guerre', { why }) };
  } else if (d.path === 'war' && d.battle !== 'none') {
    peace = { id: 'peace', label: tr('Faire la paix'), on: false, why: tr('Trop tard : la bataille est engagée') };
    war = { id: 'war', label: tr('À la bataille'), on: true, go: 'path', why: d.battle === 'lost' ? tr('Nos troupes se refont chez notre allié') : tr('Nos troupes sont prêtes à débarquer') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, done: true, why: tr('Leur côte est reconnue') };
  } else if (d.path === 'war') {
    peace = { id: 'peace', label: tr('Faire la paix plutôt'), on: true, go: 'path', why: tr('Changer de voie : deux pourparlers, sans risque') };
    war = { id: 'war', label: tr('Faire la guerre'), on: false, done: true, why: tr('Choisi : envoyez d’abord des éclaireurs') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: true, go: 'mission', mission: WAR_MISSION, why: tr('Reconnaître leur côte avant la bataille') };
  } else if (d.path === 'peace') {
    const next = PEACE_CHAIN.find((id) => !done(id)) ?? PEACE_MISSION;
    peace = { id: 'peace', label: tr('Poursuivre la paix'), on: true, go: 'mission', mission: next, why: next === PEACE_MISSION ? tr('L’ambassade de la paix') : tr('Les émissaires, puis l’ambassade') };
    war = { id: 'war', label: tr('Faire la guerre plutôt'), on: true, go: 'path', why: tr('Changer de voie : une bataille, butin et tribut') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('Sur la voie de la guerre') };
  } else {
    peace = { id: 'peace', label: tr('Faire la paix'), on: true, go: 'path', why: tr('Deux pourparlers, sans risque') };
    war = { id: 'war', label: tr('Faire la guerre'), on: true, go: 'path', why: tr('Aux côtés de votre allié : une bataille') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('Sur la voie de la guerre') };
  }
  // le commerce avec eux : seulement chez notre allié (le comptoir des émissaires chez eux n'a pas d'échange à lui)
  const trade: Gesture = { id: 'trade', label: tr('Commercer'), on: false, why: tr('Vous commercez chez votre allié, pas chez eux') };
  return { people: p, role: 'rival', mood, moodWhy, status, tone, gestures: [peace, war, scouts, trade] };
}

