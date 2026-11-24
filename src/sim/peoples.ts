import type { World } from '../world/world';
import type { People } from '../world/archipelago';
import { tr } from '../i18n';
import { archipelagoOn, ENDGAME_AGE, PEACE_CHAIN, PEACE_MISSION, peopleName as name, rivalOf, WAR_MISSION, WAR_SPOILS, talkRisk, isleOffered, isleWhy, boonsMatter } from './diplomacy';
import { ISLE_MISSIONS } from './isleMissions';

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
 * Ce que mène chaque geste : `ally` la carte du choix de l'allié, `path` la carte de la paix ou de la guerre, ou, la voie
 * prise, sa feuille de route (ou la bataille, `Game.openDiploChoice`), `change` la carte de la paix ou de la guerre pour
 * changer de voie, `mission` une expédition (`mission`), `trade` la fiche du comptoir, `post` bâtir le comptoir chez
 * l'allié, `visit` la vue sur une île
 */
export type GestureGo = 'ally' | 'path' | 'change' | 'mission' | 'trade' | 'post' | 'visit';
export interface Gesture {
  id: 'ally' | 'trade' | 'visit' | 'scouts' | 'peace' | 'war' | 'isles';
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
  /** ce que les visites sur leur île ont gagné pour le dénouement (troupes, bonne volonté), une ligne chacun ; vide sinon */
  boons?: string[];
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

function allyCard(w: Pick<World, 'isles' | 'diplo' | 'exp'>, c: PeoplesCtx, p: People): PeopleCard {
  const d = w.diplo, over = d.conflict !== 'open';
  const trade: Gesture = c.tradeOpen ? { id: 'trade', label: tr('Commercer'), on: true, go: 'trade' }
    : c.age < 2 ? { id: 'trade', label: tr('Commercer'), on: false, why: tr('Au Médiéval : un comptoir sur leur île') }
      : { id: 'trade', label: tr('Bâtir un comptoir'), on: true, go: 'post', why: tr('On y vend nos matériaux contre de l’or') };
  // (les visites sur leur île les rapprochent : assez de renforts gagnés, et ils sont déjà fraternels)
  const warm = !over && d.boons.allies + d.boons.ours >= 6;
  return {
    people: p, role: 'ally', mood: over || warm ? 4 : 3,
    moodWhy: over ? (d.conflict === 'treaty' ? tr('La guerre est finie : vous êtes restés à leurs côtés.') : tr('Vous les avez aidés à finir la guerre.')) : warm ? tr('Vos visites sur leur île les ont touchés : ils se battraient pour vous.') : tr('Vous avez pris leur parti dans la guerre.'),
    status: over ? tr('En paix, à vos côtés') : tr('En guerre contre {other}', { other: name(rivalOf(p)) }), tone: over ? 'ally' : 'war',
    gestures: [trade, { id: 'visit', label: tr('Voir leur île'), on: true, go: 'visit', why: tr('Vous y bâtissez hors de leur ville') }, isles(w, c, 'ally')],
    boons: boonLines(w, 'ally'),
  };
}

function rivalCard(w: Pick<World, 'isles' | 'diplo' | 'exp'>, c: PeoplesCtx, p: People): PeopleCard {
  const d = w.diplo, done = (id: string) => w.exp.done.includes(id);
  // l'humeur et l'état
  let mood: Mood, moodWhy: string, status: string, tone: PeopleCard['tone'];
  if (d.conflict === 'peace') { mood = 3; moodWhy = tr('La paix est signée : vos marchands sont les bienvenus.'); status = tr('En paix avec vous'); tone = 'peace'; }
  else if (d.conflict === 'treaty') { mood = 2; moodWhy = tr('Un traité a fini la guerre entre les deux îles.'); status = tr('En paix (traité)'); tone = 'peace'; }
  else if (d.conflict === 'won') { mood = 1; moodWhy = tr('Vaincus, ils vous paient tribut.'); status = tr('Vaincus : {n} or de tribut par jour', { n: WAR_SPOILS.tribute }); tone = 'calm'; }
  else if (d.saga.truce) { mood = 3; moodWhy = tr('Une trêve est signée : les combats ont cessé.'); status = tr('En trêve avec votre allié'); tone = 'peace'; }
  else if (d.path === 'war') { mood = 0; moodWhy = tr('Vous préparez la guerre contre eux.'); status = tr('En guerre contre vous'); tone = 'war'; }
  else if (d.post) { mood = 2; moodWhy = tr('Vos émissaires les ont apaisés : ils écoutent.'); status = tr('En guerre contre votre allié'); tone = 'war'; }
  else { mood = 1; moodWhy = tr('Vous êtes l’allié de leur ennemi.'); status = tr('En guerre contre votre allié'); tone = 'war'; }
  // (le conflit en cours : la bonne volonté gagnée sur leur île les adoucit, un vol les fâche)
  if (d.conflict === 'open' && d.path !== 'war') {
    if (d.boons.peace >= 20 && mood < 3) { mood = (mood + 1) as Mood; moodWhy = tr('Le transfuge et vos visites plaident pour vous : ils pensent à la paix.'); }
    else if (d.boons.peace < 0 && mood > 0) { mood = (mood - 1) as Mood; moodWhy = tr('Ils vous accusent de les avoir volés.'); }
  }

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
    // (le camp posé : la campagne suit les âges, le geste rouvre sa feuille de route)
    war = d.camp.held.length ? { id: 'war', label: tr('La suite de la guerre'), on: true, go: 'path', why: tr('Notre camp tient leur plage : la campagne, âge par âge') }
      : { id: 'war', label: tr('À la bataille'), on: true, go: 'path', why: d.battle === 'lost' ? tr('Nos troupes se refont chez notre allié') : tr('Nos troupes sont prêtes à débarquer') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, done: true, why: tr('Leur côte est reconnue') };
  } else if (d.path === 'war') {
    peace = { id: 'peace', label: tr('Faire la paix plutôt'), on: true, go: 'change', why: tr('Changer de voie : deux pourparlers, {r} % d’échec chacun', { r: Math.round(talkRisk(d) * 100) }) };
    // (la voie prise : le geste rouvre sa feuille de route, les étapes et comment s'y préparer)
    war = { id: 'war', label: tr('La suite de la guerre'), on: true, go: 'path', why: tr('Les étapes, et comment s’y préparer') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: true, go: 'mission', mission: WAR_MISSION, why: tr('Reconnaître leur côte avant la bataille') };
  } else if (d.path === 'peace' && d.saga.truce) {
    // (la trêve signée : la suite de la paix ; plus de retour à la guerre)
    peace = { id: 'peace', label: tr('Poursuivre la paix'), on: true, go: 'path', why: tr('La trêve est signée : la suite, jusqu’à la paix') };
    war = { id: 'war', label: tr('Faire la guerre plutôt'), on: false, why: tr('Une trêve est signée') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('Sur la voie de la guerre') };
  } else if (d.path === 'peace') {
    const next = PEACE_CHAIN.find((id) => !done(id)) ?? PEACE_MISSION;
    peace = { id: 'peace', label: tr('Poursuivre la paix'), on: true, go: 'path', mission: next, why: next === PEACE_MISSION ? tr('L’ambassade de la paix') : tr('Les émissaires, puis l’ambassade') };
    war = { id: 'war', label: tr('Faire la guerre plutôt'), on: true, go: 'change', why: tr('Changer de voie : une campagne, butin et tribut') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('Sur la voie de la guerre') };
  } else {
    peace = { id: 'peace', label: tr('Faire la paix'), on: true, go: 'path', why: tr('Deux pourparlers, {r} % d’échec chacun', { r: Math.round(talkRisk(d) * 100) }) };
    war = { id: 'war', label: tr('Faire la guerre'), on: true, go: 'path', why: tr('Aux côtés de votre allié : une bataille') };
    scouts = { id: 'scouts', label: tr('Envoyer des éclaireurs'), on: false, why: tr('Sur la voie de la guerre') };
  }
  // le commerce avec eux : seulement chez notre allié (le comptoir des émissaires chez eux n'a pas d'échange à lui)
  const trade: Gesture = { id: 'trade', label: tr('Commercer'), on: false, why: tr('Vous commercez chez votre allié, pas chez eux') };
  return { people: p, role: 'rival', mood, moodWhy, status, tone, gestures: [peace, war, scouts, isles(w, c, 'rival'), trade], boons: boonLines(w, 'rival') };
}

/**
 * Les visites facultatives sur l'île d'un peuple (`ISLE_MISSIONS`) : le geste mène à la première encore à faire et proposée ;
 * toutes faites, il est coché ; aucune proposée, il est grisé avec la raison (`isleWhy`)
 */
function isles(w: Pick<World, 'isles' | 'diplo' | 'exp'>, c: PeoplesCtx, to: 'ally' | 'rival'): Gesture {
  const label = tr('Visites sur leur île');
  if (c.age < ENDGAME_AGE) return { id: 'isles', label, on: false, why: tr('Au Médiéval') };
  // (chez le rival, le conflit réglé : rien à y gagner)
  if (to === 'rival' && w.diplo.conflict !== 'open') return { id: 'isles', label, on: false, why: tr('Le conflit est réglé') };
  const all = ISLE_MISSIONS.filter((m) => m.isle!.to === to), offered = all.filter((m) => isleOffered(w, m.id, m.isle!.when));
  const todo = offered.filter((m) => !w.exp.done.includes(m.id));
  if (todo.length) return { id: 'isles', label, on: true, go: 'mission', mission: todo[0].id, why: to === 'ally' ? tr('{n} à faire : des renforts pour la bataille, de la bonne volonté pour la paix', { n: todo.length }) : tr('{n} à faire : affaiblir leur flotte, plaider la paix… ou les voler', { n: todo.length }) };
  if (offered.length) return { id: 'isles', label, on: false, done: true, why: tr('Toutes faites') };
  return { id: 'isles', label, on: false, why: isleWhy(w, all[0].id, all[0].isle!.when) ?? tr('Pas maintenant') };
}

/** Ce que les visites ont gagné, à montrer sur la fiche (tant que le conflit dure) */
function boonLines(w: Pick<World, 'isles' | 'diplo'>, to: 'ally' | 'rival'): string[] {
  if (!boonsMatter(w)) return [];
  const b = w.diplo.boons, out: string[] = [];
  if (to === 'ally') {
    if (b.allies > 0) out.push(tr('+{n} de leurs troupes à vos côtés pour la bataille', { n: b.allies }));
    if (b.ours > 0) out.push(tr('+{n} de nos soldats armés par leurs forgerons', { n: b.ours }));
  } else {
    if (b.foes > 0) out.push(tr('−{n} des leurs à la bataille (flotte et garnison affaiblies)', { n: b.foes }));
    if (b.peace) out.push(tr('Pourparlers : {r} % d’échec au lieu de 30 %', { r: Math.round(talkRisk(w.diplo) * 100) }));
  }
  return out;
}

