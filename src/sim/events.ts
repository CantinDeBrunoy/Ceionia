import type { DestKind, Effect } from './missions';
import type { GearId } from './gear';

/**
 * Décisions en cours d'expédition : une fois sur place (et parfois à mi-chemin du travail), l'équipe tombe sur un imprévu et
 * attend la décision du joueur. Chaque option change le risque, le temps passé, ce que l'on rapporte… et certaines demandent
 * un équipement emporté (une corde, une barque, des armes)
 */

export interface EventOption {
  label: string;
  /** équipement nécessaire : l'une de ces pièces, emportée par l'équipe */
  needs?: GearId[];
  /** multiplicateur du risque de l'expédition */
  risk: number;
  /** temps de travail en plus (ou en moins), en secondes de jeu */
  work?: number;
  /** gains en plus si l'expédition réussit */
  bonus?: Effect[];
  /** blessés, quoi qu'il arrive */
  hurt?: number;
  /** ce qu'en dira le récit */
  text: string;
}

export interface ExpEvent {
  id: string;
  /** destinations où il peut survenir */
  where: DestKind[];
  /** missions qui l'appellent en particulier (sinon toutes) */
  missions?: string[];
  title: string;
  text: string;
  options: EventOption[];
}

const WEAPONS: GearId[] = ['spear', 'bow', 'sword', 'rifle'];
const food = (n: number, days?: number): Effect => ({ t: 'need', need: 'food', n, days });
const joy = (n: number, days?: number): Effect => ({ t: 'need', need: 'joy', n, days });

export const EVENTS: ExpEvent[] = [
  {
    id: 'boar', where: ['forest', 'plain'], title: 'Une laie et ses petits',
    text: 'Des grognements dans les fourrés : une laie et ses marcassins barrent le sentier. Elle n’a pas l’air commode.',
    options: [
      { label: 'Faire un grand détour', risk: 0.9, work: 6, text: 'On a laissé la laie tranquille, quitte à marcher davantage.' },
      { label: 'L’effrayer en brandissant les armes', needs: WEAPONS, risk: 0.7, text: 'Armes levées et grands cris : la laie a filé avec ses petits.' },
      { label: 'Passer en silence', risk: 1.25, work: -3, text: 'On est passé sur la pointe des pieds… à deux doigts de la charge.' },
    ],
  },
  {
    id: 'flood', where: ['river'], title: 'La rivière a gonflé',
    text: 'Il a plu en amont : l’eau est montée pendant la nuit et le courant emporte des branches.',
    options: [
      { label: 'Attendre la décrue', risk: 0.85, work: 8, text: 'On a attendu que l’eau baisse, à l’abri des saules.' },
      { label: 'Passer en barque', needs: ['boat'], risk: 0.6, text: 'La barque a fendu le courant sans une goutte embarquée.' },
      { label: 'Traverser à gué', risk: 1.3, work: -4, text: 'On a traversé à gué, de l’eau jusqu’à la taille.' },
    ],
  },
  {
    id: 'ledge', where: ['mountain'], title: 'Un passage au-dessus du vide',
    text: 'Le sentier se réduit à une corniche étroite, avec le vide d’un côté et des cailloux qui roulent.',
    options: [
      { label: 'S’encorder', needs: ['rope'], risk: 0.55, text: 'Encordés deux par deux, on a franchi la corniche sans frayeur.' },
      { label: 'Contourner par le long chemin', risk: 0.9, work: 8, text: 'On a pris le long chemin des bergers.' },
      { label: 'Avancer prudemment', risk: 1.15, text: 'Pas à pas sur la corniche, le cœur battant.' },
    ],
  },
  {
    id: 'dark', where: ['cave'], title: 'Il fait noir comme dans un four',
    text: 'Plus on avance, plus la galerie s’enfonce : la lumière du jour a disparu depuis longtemps.',
    options: [
      { label: 'Allumer les torches', needs: ['torch'], risk: 0.6, text: 'À la lueur des torches, les parois scintillaient.' },
      { label: 'Suivre le courant d’air', risk: 1.1, bonus: [{ t: 'ore', n: 1 }], text: 'On a suivi le courant d’air… jusqu’à une veine inconnue.' },
      { label: 'Revenir sur ses pas un moment', risk: 0.9, work: 6, text: 'On est revenu à l’entrée pour mieux repartir.' },
    ],
  },
  {
    id: 'wolves', where: ['forest', 'plain', 'far'], title: 'Des loups rôdent',
    text: 'À la nuit tombée, des yeux brillent autour du camp. Une meute tourne en rond, sans s’approcher… pour l’instant.',
    options: [
      { label: 'Monter la garde, armes en main', needs: WEAPONS, risk: 0.6, text: 'Les veilleurs armés ont tenu la meute à distance toute la nuit.' },
      { label: 'Entretenir un grand feu', risk: 0.85, work: 3, text: 'Un grand feu toute la nuit : les loups n’ont pas osé approcher.' },
      { label: 'Lever le camp sur-le-champ', risk: 1.2, work: -4, text: 'On a levé le camp en pleine nuit, les loups sur les talons.' },
    ],
  },
  {
    id: 'storm', where: ['plain', 'far', 'mountain'], title: 'L’orage menace',
    text: 'Le ciel noircit à vue d’œil, et l’on entend déjà gronder au loin.',
    options: [
      { label: 'S’abriter et attendre', risk: 0.85, work: 7, text: 'On a attendu la fin de l’orage, serrés sous un rocher.' },
      { label: 'Continuer sous la pluie', risk: 1.2, work: -3, text: 'Trempés jusqu’aux os, on a continué coûte que coûte.' },
    ],
  },
  {
    id: 'traveler', where: ['plain', 'forest', 'far', 'river', 'mountain'], title: 'Un voyageur blessé',
    text: 'Au bord du chemin, un voyageur s’est foulé la cheville. Il est loin de chez lui.',
    options: [
      { label: 'Le soigner', needs: ['kit'], risk: 1, bonus: [joy(2, 5)], text: 'Soigné et reposé, le voyageur a promis de raconter partout l’accueil du village.' },
      { label: 'Le ramener au village', risk: 1, work: 5, bonus: [joy(1, 4)], text: 'On a ramené le voyageur au village, qui l’a fêté comme un des siens.' },
      { label: 'Passer son chemin', risk: 1.05, text: 'On a passé son chemin, sans fierté.' },
    ],
  },
  {
    id: 'shoal', where: ['river'], missions: ['fishing', 'berries', 'seeds', 'reef'], title: 'Un banc de poissons',
    text: 'L’eau frémit : un grand banc de poissons remonte le courant juste devant l’équipe !',
    options: [
      { label: 'Lancer les filets', risk: 1.05, work: 5, bonus: [food(2, 4)], text: 'Les filets sont revenus pleins à craquer.' },
      { label: 'Ne pas se disperser', risk: 0.95, text: 'On a laissé passer le banc pour rester à l’ouvrage.' },
    ],
  },
  {
    id: 'vein', where: ['mountain', 'cave'], title: 'Un éclat dans la roche',
    text: 'Au détour d’un rocher, quelque chose brille dans la paroi.',
    options: [
      { label: 'Creuser un peu', risk: 1.1, work: 7, bonus: [{ t: 'ore', n: 2 }], text: 'On a creusé : une belle veine de minerai.' },
      { label: 'Ne pas traîner', risk: 0.95, text: 'On a noté l’endroit pour une autre fois.' },
    ],
  },
  {
    id: 'fog', where: ['plain', 'forest', 'mountain', 'far'], title: 'Le brouillard tombe',
    text: 'En quelques minutes, un brouillard épais avale le paysage : on n’y voit plus à dix pas.',
    options: [
      { label: 'Attendre qu’il se lève', risk: 0.9, work: 6, text: 'On a attendu que le brouillard se lève, emmitouflés.' },
      { label: 'Avancer à la boussole du soleil', risk: 1.2, work: -3, text: 'On a avancé à l’aveugle, en se tenant par l’épaule.' },
    ],
  },
  {
    id: 'hosts', where: ['far'], title: 'Un village voisin',
    text: 'Un hameau inconnu accueille l’équipe avec curiosité : on vous invite à partager le repas.',
    options: [
      { label: 'Échanger des cadeaux', risk: 0.9, work: 4, bonus: [joy(2, 5)], text: 'Cadeaux échangés, chansons partagées : de nouveaux amis.' },
      { label: 'Remercier et repartir à l’aube', risk: 1, text: 'On a remercié nos hôtes avant de reprendre la route.' },
    ],
  },
  {
    id: 'stallion', where: ['plain', 'far', 'river', 'forest'], missions: ['horses', 'herd'], title: 'Le meneur de la harde',
    text: 'Un grand mâle fougueux veille sur les bêtes et s’interpose dès qu’on approche.',
    options: [
      { label: 'L’amadouer patiemment', risk: 0.8, work: 6, text: 'Des heures de patience : le meneur s’est laissé caresser l’encolure.' },
      { label: 'Le capturer au lasso', needs: ['rope'], risk: 0.75, bonus: [{ t: 'herd', kinds: ['horse'] }], text: 'Un lasso bien lancé : le meneur a suivi, et la harde avec lui.' },
      { label: 'Le laisser filer', risk: 1, work: -2, text: 'On a laissé partir le meneur pour ne pas affoler la harde.' },
    ],
  },
  {
    id: 'pack', where: ['forest'], missions: ['wolf'], title: 'Les traces du loup',
    text: 'Les traces sont fraîches : le loup n’est pas seul, toute la meute est passée par là.',
    options: [
      { label: 'Le traquer armes à la main', needs: WEAPONS, risk: 0.65, text: 'Armes au poing, on a acculé la meute au fond du vallon.' },
      { label: 'Poser des pièges', needs: ['rope'], risk: 0.8, work: 5, text: 'Les pièges de corde ont fait le reste pendant la nuit.' },
      { label: 'Suivre les traces sans bruit', risk: 1.15, text: 'On a suivi la meute, à pas de loup.' },
    ],
  },
  {
    id: 'rockfall', where: ['mountain', 'cave'], missions: ['mine', 'coal', 'railway', 'flint'], title: 'Ça craque au-dessus',
    text: 'Un grondement sourd, des graviers qui pleuvent : la paroi travaille.',
    options: [
      { label: 'Étayer avant de continuer', risk: 0.75, work: 7, text: 'On a étayé la galerie avec des poutres avant d’aller plus loin.' },
      { label: 'S’encorder et continuer', needs: ['rope'], risk: 0.8, text: 'Encordés, on a continué sous la paroi.' },
      { label: 'Foncer avant que ça tombe', risk: 1.3, work: -4, text: 'On a foncé, un œil sur le plafond.' },
    ],
  },
];

/** Imprévu pour une équipe (de préférence propre à sa mission), jamais deux fois le même ; null s'il n'y en a pas */
export function pickEvent(dest: DestKind, mission: string, seen: string[], rnd: () => number): ExpEvent | null {
  const ok = EVENTS.filter((e) => e.where.includes(dest) && !seen.includes(e.id));
  const own = ok.filter((e) => e.missions?.includes(mission)), any = ok.filter((e) => !e.missions);
  const list = own.length && (rnd() < 0.7 || !any.length) ? own : any;
  return list.length ? list[Math.floor(rnd() * list.length)] : null;
}
