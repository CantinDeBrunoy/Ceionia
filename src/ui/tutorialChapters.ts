import { KINDS } from '../build/catalog';
import { tr, localize, fmt } from '../i18n';
import type { Chapter, ChapterId, Step, StepText, Tutorial } from './tutorial';
import type { UI } from './ui';

/**
 * Les chapitres du tutoriel : de courtes suites d'étapes qu'un événement lance, une seule fois (voir `Tutorial.chapter`).
 * « Affronter les démons » guide sur l'île du portail quand le joueur choisit le PvE : ses défenses (les joueurs ne
 * comprenaient pas qu'elles se bâtissent sur l'île), la garnison, les ordres, l'invasion. « Les Enfers », à la première
 * entrée : la cible, les troupes, l'attaque, le retour. Le tutoriel principal n'en dépend pas (le PvE est facultatif)
 */

/** Les textes des chapitres (une phrase courte par étape ; `{tower}`, `{barracks}`, `{n}` : remplis selon la partie) */
export const CHAPTER_TEXT = {
  pve: {
    title: 'Affronter les démons',
    goIsle: 'Aller sur l’île',
    command: 'Commander la garnison',
    defenses: {
      title: 'Les défenses de l’île',
      text: 'Les démons sortent du portail : bâtissez {tower} et {barracks} sur son île, pas au village.',
      tasks: ['{tower} sur l’île', '{barracks} sur l’île'],
      village: 'Au village, elle ne garde pas le portail : il la faut sur l’île.',
    },
    recruit: {
      title: 'La garnison',
      text: 'Recrutez des soldats à la caserne de l’île, dans l’onglet « Recruter » de « Ma garnison ».',
      tasks: ['Recruter un soldat'],
    },
    orders: {
      title: 'Vos ordres',
      text: 'Choisissez vos soldats (un clic, ou « Tous »), puis faites un clic droit là où ils doivent aller.',
      tasks: ['Choisir des soldats', 'Les envoyer d’un clic droit'],
      wait: 'Vos recrues arrivent bientôt sur l’île.',
    },
    invasion: {
      title: 'L’invasion',
      text: 'Avec {n} soldats sur l’île, « Affronter » lance l’invasion : repoussez-la pour ouvrir les Enfers.',
      tasks: [] as string[],
    },
  },
  hell: {
    title: 'Les Enfers',
    goal: {
      title: 'La cible',
      text: 'Le 🎯 marque le prochain bastion à abattre : un avant-poste, puis la forteresse de la zone.',
      tasks: ['Centrer la vue sur la cible'],
    },
    pick: {
      title: 'Vos troupes',
      text: 'Choisissez des troupes : une carte en bas, ou « Tous ».',
      tasks: ['Choisir des troupes'],
      none: 'Aucune troupe ici : « Renforts » fait venir la garnison de l’île.',
    },
    attack: {
      title: 'À l’attaque',
      text: 'Faites un clic droit sur la cible 🎯 : vos troupes y marchent et l’attaquent.',
      tasks: ['Donner un ordre d’un clic droit'],
    },
    back: {
      title: 'Le retour',
      text: '« Village », ou un clic sur le portail, vous ramène au village ; vos troupes restent ici.',
      tasks: [] as string[],
    },
  },
};

// lus dans la langue courante (voir `localize`, src/i18n/index.ts)
{
  const texts = (o: object) => Object.keys(o).filter((k) => { const v = (o as Record<string, unknown>)[k]; return typeof v === 'string' || Array.isArray(v); });
  for (const c of Object.values(CHAPTER_TEXT)) {
    localize(c, texts(c) as never);
    for (const v of Object.values(c)) if (v && typeof v === 'object' && !Array.isArray(v)) localize(v, texts(v) as never);
  }
}

/** Ce que les chapitres regardent de la partie (fourni par le jeu, voir `main.ts`) */
export interface ChapterHost {
  root: HTMLElement;
  age(): number;
  /** tours de garde et casernes debout sur l'île du portail, et au village */
  isle(): { towers: number; barracks: number };
  village(): { towers: number; barracks: number };
  /** soldats de l'armée et recrues en route */
  army(): number;
  /** soldats qu'il faut sur l'île pour que l'invasion soit prête */
  need(): number;
  /** le joueur affronte les démons (faux : portail refermé) */
  pve(): boolean;
  /** où l'on commande (l'île, les Enfers, rien) et le monde à l'écran */
  theater(): 'isle' | 'hell' | null;
  mode(): string;
  /** la vue regarde l'île du portail */
  atIsle(): boolean;
  /** troupes choisies ; le dernier ordre donné (un objet neuf à chaque ordre) */
  selected(): number;
  lastOrder(): object | null;
  /** prendre le commandement de l'île (la vue y va) */
  commandIsle(): void;
}

/** Une étape de chapitre : ses textes et sa logique */
const step = (id: string, t: StepText, s: Omit<Step, 'id' | 't'>): Step => ({ id, t, ...s });

/** Les deux chapitres */
export function chapters(tuto: Tutorial, ui: UI, h: ChapterHost): Record<ChapterId, Chapter> {
  const P = CHAPTER_TEXT.pve, E = CHAPTER_TEXT.hell, q = (s: string) => h.root.querySelector(s);
  const name = (k: 'watchtower' | 'barracks') => tr('« {name} »', { name: KINDS[k].names[Math.max(h.age(), KINDS[k].minAge)] });
  const names = (s: string) => fmt(s, { tower: name('watchtower'), barracks: name('barracks'), n: h.need() });
  /** un bouton de la barre des troupes */
  const bar = (a: string) => q(`#troopBar [data-a="${a}"]`);
  /** l'onglet du menu de l'île, s'il n'est pas déjà ouvert */
  const tab = (t: 'build' | 'rec') => { const b = bar(`tab:${t}`); return b && !b.classList.contains('on') ? b : null; };
  const isle = () => h.theater() === 'isle';
  const goIsle = () => (!isle() && !h.atIsle() ? { label: P.goIsle, run: () => h.commandIsle() } : null);
  const command = () => (!isle() ? { label: P.command, run: () => h.commandIsle() } : null);
  let village = { towers: 0, barracks: 0 }, troops = 0, order: object | null = null;

  const pve: Step[] = [
    step('pveDefenses', P.defenses, {
      begin: () => (village = h.village()),
      text: () => names(P.defenses.text),
      tasks: () => P.defenses.tasks.map(names),
      check: () => { const d = h.isle(); return [d.towers > 0, d.barracks > 0]; },
      // au commandement de l'île : l'onglet Bâtir puis la tuile ; la vue sur l'île : l'outil de construction du village
      anchor: () => {
        const d = h.isle(), k = !d.towers ? 'watchtower' : !d.barracks ? 'barracks' : null;
        if (!k) return null;
        if (isle()) return tab('build') ?? bar(`ibuild:${k}`);
        if (!h.atIsle()) return null;
        return ui.tab !== 'build' ? q('#modes [data-t="build"]') : ui.cat !== 'war' ? q('#subcats [data-c="war"]') : q(`#items [data-kind="${k}"]`);
      },
      // posée au village pendant l'étape : elle ne compte pas
      note: () => { const d = h.isle(), v = h.village(); return (!d.towers && v.towers > village.towers) || (!d.barracks && v.barracks > village.barracks) ? P.defenses.village : ''; },
      act: goIsle,
    }),
    step('pveRecruit', P.recruit, {
      begin: () => (troops = h.army()),
      check: () => [h.army() > troops],
      anchor: () => (isle() ? tab('rec') ?? q('#troopBar .trb.go[data-a^="rec:"]') ?? q('#troopBar [data-a^="rec:"]') : null),
      act: command,
    }),
    step('pveOrders', P.orders, {
      begin: () => (order = h.lastOrder()),
      check: () => [h.selected() > 0, !!h.lastOrder() && h.lastOrder() !== order],
      anchor: () => (isle() && !h.selected() ? q('#troopBar .tall') ?? q('#troopBar .tcard') : null),
      note: () => (isle() && !q('#troopBar .tcard') ? P.orders.wait : ''),
      act: command,
    }),
    step('pveInvasion', P.invasion, {
      read: true, check: () => [],
      text: () => names(P.invasion.text),
      anchor: () => (isle() ? q('#troopBar .tstate .wst.hot') : null),
    }),
  ];

  const hell: Step[] = [
    step('hellGoal', E.goal, {
      check: () => [tuto.clicked('goal')],
      anchor: () => bar('goal') ?? q('#troopBar .tgoal'),
    }),
    step('hellPick', E.pick, {
      check: () => [h.selected() > 0],
      anchor: () => q('#troopBar .tall') ?? q('#troopBar .tcard') ?? bar('garrison'),
      note: () => (q('#troopBar .tcard') ? '' : E.pick.none),
    }),
    // (la bulle se tient à l'écart : la cible doit rester libre sous le curseur)
    step('hellAttack', E.attack, {
      begin: () => (order = h.lastOrder()),
      check: () => [!!h.lastOrder() && h.lastOrder() !== order],
      anchor: () => null,
    }),
    step('hellBack', E.back, { read: true, check: () => [], anchor: () => bar('leave') }),
  ];

  return {
    pve: { title: () => P.title, steps: pve, live: () => h.pve(), away: () => h.mode() !== 'surface' },
    // le chapitre des Enfers s'achève quand on les quitte (il ne se joue qu'une fois, à la première entrée)
    hell: { title: () => E.title, steps: hell, live: () => h.mode() === 'hell' },
  };
}

/** Les textes des étapes de tous les chapitres (pour les tests) */
export function chapterTexts(): StepText[] {
  return Object.values(CHAPTER_TEXT).flatMap((c) => Object.values(c).filter((v): v is StepText => !!v && typeof v === 'object' && 'text' in v));
}
