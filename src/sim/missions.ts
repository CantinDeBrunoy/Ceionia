import type { World } from '../world/world';
import { Danger, GearId, Stock, emptyStock, GEAR_BY } from './gear';
import type { KindId } from '../build/catalog';

/**
 * Expéditions : à chaque âge, des missions à choix (au moins une obligatoire pour passer à l'âge suivant). Une petite équipe
 * d'habitants part sur la carte (forêt, plaine, rivière, montagne, grotte, au-delà des collines), agit sur place et revient ;
 * selon le choix et la chance, le village y gagne des bêtes, du minerai, des savoir-faire… ou des blessés et des soucis
 */

/** Où l'équipe se rend */
export type DestKind = 'plain' | 'forest' | 'river' | 'mountain' | 'cave' | 'far';
/** Besoins que l'expédition peut améliorer (ou dégrader) */
export type NeedKey = 'food' | 'water' | 'jobs' | 'joy';
/** Bêtes que l'on peut ramener et élever près des fermes */
export type HerdKind = 'sheep' | 'cow' | 'pig' | 'horse';
/**
 * Ce que l'on voit l'équipe faire sur place : apprivoiser une harde, pêcher en barque ou depuis la berge, miner, cueillir,
 * traquer, bâtir (enclos, voie ferrée), ou camper
 */
export type Scene = 'herd' | 'boat' | 'fish' | 'mine' | 'gather' | 'hunt' | 'build' | 'rails' | 'camp'
  // le cœur de chaque mission : enclos de branchages, pierre à sel, vallon, galets, houblon, col, chêne enfumé, essaim, troc,
  // source chaude, galerie, grotte, jongleurs, abbaye, étoiles filantes, cratère, pont, sondage, sommet, camp de base, plongée
  | 'corral' | 'salt' | 'roundup' | 'pebbles' | 'hops' | 'pass' | 'smoke' | 'swarm' | 'trade' | 'spring' | 'gallery' | 'cave'
  | 'troupe' | 'abbey' | 'stars' | 'crater' | 'bridge' | 'drill' | 'summit' | 'basecamp' | 'dive';

export type Effect =
  /** bêtes ramenées : elles paissent ensuite près des fermes */
  | { t: 'herd'; kinds: HerdKind[] }
  | { t: 'ore'; n: number }
  /** capacité d'un besoin : pour toujours, ou pendant quelques jours */
  | { t: 'need'; need: NeedKey; n: number; days?: number }
  /** savoir-faire durable (« seeds » : les champs donnent davantage) */
  | { t: 'perk'; id: string }
  /** habitants blessés, qui se reposent chez eux quelques jours */
  | { t: 'injured'; n: number; days: number }
  /** filons du monde souterrain abattus par la troupe (les plus proches de l'entrée) */
  | { t: 'veins'; n: number }
  /** bêtes perdues en route */
  | { t: 'unherd'; kind: HerdKind; n: number };

export interface Choice {
  label: string;
  text: string;
  dest: DestKind;
  /** taille de l'équipe */
  party: number;
  /** temps passé sur place (secondes de jeu) */
  work: number;
  /** probabilité d'échec */
  risk: number;
  /** ce que l'équipe rapporte, visible au retour : des bêtes qui la suivent, un chariot, des sacs sur le dos */
  carry?: 'animals' | 'cart' | 'sacks';
  /** ce que l'équipe fait sur place, et ce qu'en dit sa carte (« troque ses poteries contre des semences ») */
  scene: Scene;
  doing?: string;
  /** dangers rencontrés (sinon ceux de la destination) : l'équipement qui les pare rend le choix plus sûr */
  danger?: Danger[];
  /** chevaux de l'écurie qu'emmène la troupe (ils reviennent avec elle) */
  mounts?: number;
  /** troupe de l'expédition armée, telle qu'on la voit sous terre */
  troop?: 'cavalry' | 'armor' | 'miners';
  win: Effect[];
  lose: Effect[];
  winText: string;
  loseText: string;
}

export interface Mission {
  id: string;
  age: number;
  /** obligatoire pour passer à l'âge suivant */
  mandatory: boolean;
  icon: string;
  title: string;
  intro: string;
  choices: Choice[];
  /** bâtiment que sa réussite permet de construire */
  unlocks?: KindId;
  /** se refait autant de fois qu'on veut (l'expédition armée dans les profondeurs) */
  repeat?: boolean;
  /** ce qu'il faut avant de partir : missions réussies, bâtiments bâtis */
  requires?: { missions?: string[]; kinds?: KindId[] };
}

const food = (n: number, days?: number): Effect => ({ t: 'need', need: 'food', n, days });
const jobs = (n: number, days?: number): Effect => ({ t: 'need', need: 'jobs', n, days });
const joy = (n: number, days?: number): Effect => ({ t: 'need', need: 'joy', n, days });
const hurt = (n: number, days: number): Effect => ({ t: 'injured', n, days });

export const MISSIONS: Mission[] = [
  // ---------------- Préhistoire ----------------
  {
    id: 'herd', age: 0, mandatory: true, icon: '🐑', title: 'Apprivoiser des bêtes', unlocks: 'pen',
    intro: 'Des bêtes sauvages paissent loin du camp. Si l’on en ramenait quelques-unes, on pourrait les garder près des fermes : du lait, de la laine et de la viande toute l’année.',
    choices: [
      {
        label: 'Suivre le troupeau dans la plaine', text: 'Long mais sûr : on marche avec les moutons jusqu’à ce qu’ils se laissent approcher.',
        dest: 'plain', scene: 'herd', doing: 'marche avec les moutons jusqu’à ce qu’ils se laissent approcher', party: 3, work: 24, risk: 0.15, carry: 'animals',
        win: [{ t: 'herd', kinds: ['sheep', 'sheep', 'sheep', 'sheep'] }, food(3)], lose: [],
        winText: 'Après des jours de marche, le troupeau a suivi les chasseurs jusqu’au camp. Les moutons broutent maintenant près des fermes.',
        loseText: 'Un orage a dispersé le troupeau. Les chasseurs rentrent bredouilles, mais ils retenteront leur chance.',
      },
      {
        label: 'Bâtir un enclos de branchages en lisière', text: 'On rabat les bêtes de la forêt dans un enclos : il faut des bras, et les sangliers sont farouches.',
        dest: 'forest', scene: 'corral', doing: 'rabat les bêtes dans un enclos de branchages', party: 4, work: 30, risk: 0.25, carry: 'animals',
        win: [{ t: 'herd', kinds: ['pig', 'pig', 'pig', 'sheep', 'sheep'] }, food(4)], lose: [hurt(1, 2)],
        winText: 'L’enclos a tenu : sangliers et moutons ont été menés au village, et ils s’y plaisent.',
        loseText: 'Un sanglier a forcé l’enclos et blessé un chasseur. Il se repose à la hutte.',
      },
      {
        label: 'Attirer les aurochs avec du sel', text: 'Rapide mais risqué : près de la rivière, les aurochs viennent lécher le sel… quand ils sont d’humeur.',
        dest: 'river', scene: 'salt', doing: 'attend, cachée, que les aurochs viennent lécher le sel', danger: ['beast', 'water'], party: 2, work: 14, risk: 0.4, carry: 'animals',
        win: [{ t: 'herd', kinds: ['cow', 'cow', 'sheep'] }, food(4)], lose: [hurt(1, 3), joy(-2, 2)],
        winText: 'Le sel a fait merveille : deux aurochs, doux comme des agneaux, ont suivi les chasseurs jusqu’au camp.',
        loseText: 'Un aurochs a chargé ! Un chasseur est blessé, et le camp a eu très peur.',
      },
    ],
  },
  {
    id: 'berries', age: 0, mandatory: false, icon: '🍇', title: 'La grande cueillette',
    intro: 'Les baies mûrissent au fond des bois et le long de l’eau : de quoi faire des réserves pour quelques jours.',
    choices: [
      {
        label: 'Partir en forêt', text: 'Des buissons à perte de vue, à condition d’arriver avant les oiseaux.',
        dest: 'forest', scene: 'gather', doing: 'cueille les baies de buisson en buisson', party: 2, work: 16, risk: 0.15, carry: 'sacks',
        win: [food(4, 4)], lose: [],
        winText: 'Les paniers débordent de baies et de noisettes : on mange bien pour quelques jours.',
        loseText: 'Les oiseaux étaient passés avant : il ne restait presque rien.',
      },
      {
        label: 'Remonter la rivière', text: 'Baies, poissons… et peut-être une baignade.',
        dest: 'river', scene: 'gather', doing: 'cueille des baies au bord de l’eau', party: 2, work: 12, risk: 0.2, carry: 'sacks',
        win: [food(3, 4), joy(1, 4)], lose: [hurt(1, 1)],
        winText: 'Baies, poissons et une baignade : tout le monde rentre content.',
        loseText: 'Une glissade sur les galets : une cheville foulée, rien de grave.',
      },
    ],
  },
  {
    id: 'flint', age: 0, mandatory: false, icon: '⛏️', title: 'Le silex de la falaise',
    intro: 'Au pied de la montagne, la falaise est pleine de silex. Avec de meilleurs outils, tout le monde travaillerait mieux.',
    choices: [
      {
        label: 'Escalader la falaise', text: 'Les plus beaux rognons sont en hauteur.',
        dest: 'mountain', scene: 'mine', doing: 'détache les rognons de silex de la falaise', party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [jobs(3)], lose: [hurt(1, 2)],
        winText: 'Des rognons de silex magnifiques : haches et grattoirs pour tout le village.',
        loseText: 'Une pierre a roulé : un grimpeur est blessé.',
      },
      {
        label: 'Ramasser des galets à la rivière', text: 'Plus petits, mais sans danger.',
        dest: 'river', scene: 'pebbles', doing: 'trie les galets de silex sur la berge', party: 2, work: 14, risk: 0.1, carry: 'sacks',
        win: [jobs(2)], lose: [],
        winText: 'Des galets de silex, petits mais tranchants : de bons outils pour tous.',
        loseText: 'Rien que du calcaire tendre… il faudra chercher ailleurs.',
      },
    ],
  },
  {
    id: 'honey', age: 0, mandatory: false, icon: '🍯', title: 'Le miel sauvage', unlocks: 'apiary',
    intro: 'Un essaim bourdonne dans un vieux chêne creux. Si l’on savait garder les abeilles près du camp, on aurait du miel et de la cire toute l’année.',
    choices: [
      {
        label: 'Enfumer le vieux chêne', text: 'Un feu d’herbes humides endort l’essaim… pas toujours assez.',
        dest: 'forest', scene: 'smoke', doing: 'enfume le vieux chêne pour endormir l’essaim', danger: ['beast'], party: 2, work: 14, risk: 0.3, carry: 'sacks',
        win: [food(2), joy(1)], lose: [hurt(1, 1)],
        winText: 'L’essaim, endormi par la fumée, a été rapporté dans un tronc creux : les premières ruches bourdonnent près du camp.',
        loseText: 'Les abeilles se sont réveillées : des piqûres en pagaille, un cueilleur gonflé comme une outre.',
      },
      {
        label: 'Suivre les abeilles jusqu’à leur essaim', text: 'Patient : on suit leur vol de fleur en fleur, jusqu’à un essaim posé dans la plaine.',
        dest: 'plain', scene: 'swarm', doing: 'recueille l’essaim posé sur une branche', party: 3, work: 22, risk: 0.12, carry: 'sacks',
        win: [food(3, 4)], lose: [],
        winText: 'Au bout de la piste, un essaim tout neuf accroché à une branche basse : on l’a cueilli sans une piqûre.',
        loseText: 'Les abeilles volaient trop haut : on les a perdues de vue.',
      },
    ],
  },
  // ---------------- Antiquité ----------------
  {
    id: 'seeds', age: 1, mandatory: true, icon: '🌾', title: 'Le blé des collines',
    intro: 'Un marchand raconte qu’au-delà des collines, un village cultive un blé qui pousse deux fois plus haut. Il faudrait en rapporter des semences.',
    choices: [
      {
        label: 'Partir avec des poteries à échanger', text: 'Le plus long chemin, mais on arrive en amis.',
        dest: 'far', scene: 'trade', doing: 'troque ses poteries contre des semences', party: 3, work: 18, risk: 0.1, carry: 'sacks',
        win: [{ t: 'perk', id: 'seeds' }, joy(1)], lose: [],
        winText: 'Les poteries ont fait forte impression : les sacs de semences sont arrivés. Les champs donneront davantage.',
        loseText: 'Les gens des collines ont refusé l’échange. Il faudra revenir avec d’autres cadeaux.',
      },
      {
        label: 'Descendre la rivière en pirogue', text: 'Rapide… si l’on passe les rapides.',
        dest: 'river', scene: 'boat', doing: 'descend la rivière en pirogue', party: 2, work: 12, risk: 0.3, carry: 'sacks',
        win: [{ t: 'perk', id: 'seeds' }, food(2)], lose: [hurt(1, 2)],
        winText: 'Le courant a porté les pirogues jusqu’au village voisin, et les semences sont rentrées bien sèches.',
        loseText: 'Une pirogue a chaviré dans les rapides : un rameur blessé, les semences perdues.',
      },
      {
        label: 'Passer par le col de la montagne', text: 'Le raccourci des chèvres : on pourrait y trouver autre chose.',
        dest: 'mountain', scene: 'pass', doing: 'franchit le col et ramasse les pierres vertes', party: 3, work: 16, risk: 0.3, carry: 'cart',
        win: [{ t: 'perk', id: 'seeds' }, { t: 'ore', n: 3 }], lose: [hurt(1, 3)],
        winText: 'Par le col, on a trouvé les semences… et des pierres vertes qui sentent le cuivre !',
        loseText: 'Le col était pris dans la brume ; un marcheur s’est blessé en chutant.',
      },
    ],
  },
  {
    id: 'horses', age: 1, mandatory: false, icon: '🐎', title: 'Les chevaux sauvages', unlocks: 'stable',
    intro: 'Une harde de chevaux galope dans la plaine. Montés ou attelés, ils changeraient la vie du village.',
    choices: [
      {
        label: 'Les approcher patiemment', text: 'Des jours à se faire accepter de la harde.',
        dest: 'plain', scene: 'herd', doing: 'se fait accepter de la harde', party: 3, work: 26, risk: 0.2, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse'] }, jobs(2)], lose: [],
        winText: 'Deux chevaux ont accepté le licol : les charrettes rouleront plus vite.',
        loseText: 'La harde s’est enfuie au galop au premier bruit.',
      },
      {
        label: 'Les rabattre dans un vallon', text: 'Plus rapide, mais un cheval affolé, ça rue.',
        dest: 'far', scene: 'roundup', doing: 'rabat les chevaux vers le corral du vallon', danger: ['beast'], party: 4, work: 18, risk: 0.35, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse', 'horse'] }, jobs(3)], lose: [hurt(1, 2)],
        winText: 'Trois chevaux rabattus et calmés : on se dispute déjà pour les monter.',
        loseText: 'Un coup de sabot : un cavalier blessé, et la harde envolée.',
      },
    ],
  },
  {
    id: 'fishing', age: 1, mandatory: false, icon: '🐟', title: 'Les grands bancs',
    intro: 'Les anciens disent que plus loin sur l’eau, les bancs de poissons sont immenses.',
    choices: [
      {
        label: 'Pêcher depuis la berge', text: 'Tranquille, à l’ombre des saules.',
        dest: 'river', scene: 'fish', doing: 'pêche à la ligne depuis la berge', party: 2, work: 14, risk: 0.1, carry: 'sacks',
        win: [food(3, 5)], lose: [],
        winText: 'Des paniers de poissons : on fume, on sale, on se régale.',
        loseText: 'Pas une touche de la journée…',
      },
      {
        label: 'Chercher les grands bancs au loin', text: 'Plus de poisson, plus de chemin.',
        dest: 'river', scene: 'boat', doing: 'pêche au large les grands bancs', danger: ['water', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [food(5, 6), joy(1, 6)], lose: [hurt(1, 1)],
        winText: 'Les grands bancs existent bien : de quoi nourrir le village une semaine !',
        loseText: 'Un orage a renversé les filets ; un pêcheur s’est entaillé la main.',
      },
    ],
  },
  {
    id: 'springs', age: 1, mandatory: false, icon: '♨️', title: 'Les sources chaudes', unlocks: 'baths',
    intro: 'Des bergers parlent d’une eau fumante qui jaillit de la montagne et guérit les douleurs. Il faudrait trouver la source et apprendre à y bâtir des bains.',
    choices: [
      {
        label: 'Suivre la vapeur dans la montagne', text: 'La source est là-haut, au bout d’un sentier escarpé.',
        dest: 'mountain', scene: 'spring', doing: 'se baigne dans la source chaude et regarde d’où elle jaillit', danger: ['fall', 'weather'], party: 3, work: 20, risk: 0.25,
        win: [joy(2)], lose: [hurt(1, 2)],
        winText: 'Au creux de la montagne, un bassin d’eau chaude fume dans le froid : les bâtisseurs savent maintenant faire des thermes.',
        loseText: 'Le sentier s’est effondré sous un porteur : il redescend sur une civière.',
      },
      {
        label: 'Remonter la rivière tiède', text: 'Là où l’eau devient tiède, la source n’est pas loin.',
        dest: 'river', scene: 'spring', doing: 'se baigne dans la source tiède, au milieu des roseaux', party: 2, work: 16, risk: 0.15,
        win: [joy(1), food(1)], lose: [],
        winText: 'La rivière tiède menait à une source chaude au milieu des roseaux : on y a pris un bain, et des idées.',
        loseText: 'L’eau était tiède… à cause du soleil. Pas de source.',
      },
    ],
  },
  // ---------------- Moyen Âge ----------------
  {
    id: 'mine', age: 2, mandatory: true, icon: '⚒️', title: 'Le filon de la montagne', unlocks: 'mine',
    intro: 'Les forgerons manquent de fer. Au cœur de la montagne, dit-on, un filon brille dans le noir.',
    choices: [
      {
        label: 'Creuser une galerie', text: 'Du travail de mineur, long et solide.',
        dest: 'mountain', scene: 'gallery', doing: 'creuse la galerie et sort le minerai au wagonnet', party: 4, work: 30, risk: 0.2, carry: 'cart',
        win: [{ t: 'ore', n: 10 }, jobs(2)], lose: [{ t: 'ore', n: 3 }, hurt(1, 2)],
        winText: 'La galerie a percé le filon : le chariot rentre chargé de minerai, les forges vont chanter.',
        loseText: 'Un éboulement a bloqué la galerie. Un mineur blessé, et seulement quelques pierres de minerai.',
      },
      {
        label: 'Explorer la grande grotte', text: 'On raconte qu’elle cache un trésor… et qu’on s’y perd.',
        dest: 'cave', scene: 'cave', doing: 'explore la grotte à la lueur des torches', party: 3, work: 20, risk: 0.35, carry: 'cart',
        win: [{ t: 'ore', n: 14 }, joy(2)], lose: [hurt(2, 2)],
        winText: 'Au fond de la grotte, un filon gros comme un tonneau ! Le village fête ses explorateurs.',
        loseText: 'Les torches se sont éteintes dans la grotte ; deux explorateurs se sont blessés en ressortant.',
      },
      {
        label: 'Acheter du minerai aux mineurs nomades', text: 'Sans danger, mais ils voudront des vivres.',
        dest: 'far', scene: 'trade', doing: 'échange des vivres contre le minerai des nomades', party: 2, work: 12, risk: 0.05, carry: 'cart',
        win: [{ t: 'ore', n: 6 }, food(-2, 3)], lose: [],
        winText: 'Les nomades ont échangé leur minerai contre des vivres : il faudra se serrer un peu la ceinture.',
        loseText: 'Les nomades avaient déjà levé le camp.',
      },
    ],
  },
  {
    id: 'deep', age: 2, mandatory: false, repeat: true, icon: '⚔️', title: 'Expédition armée dans les profondeurs',
    requires: { missions: ['horses', 'mine'], kinds: ['stable'] },
    intro: 'Sous les grottes et les failles, les galeries regorgent de minerai… et de créatures. Seule une troupe armée peut y descendre, tenir les galeries le temps d’abattre les filons, et en revenir. Longue et dangereuse ; on peut y retourner tant qu’il reste des filons.',
    choices: [
      {
        label: 'Charge de cavalerie', text: 'Trois chevaux de l’écurie et leurs cavaliers foncent dans les grandes galeries : rapides, mais les bêtes craignent le noir.',
        dest: 'cave', scene: 'mine', doing: 'charge dans les galeries et abat les filons', troop: 'cavalry', mounts: 3, danger: ['monster', 'dark'], party: 4, work: 34, risk: 0.5, carry: 'cart',
        win: [{ t: 'veins', n: 4 }], lose: [hurt(2, 3), { t: 'unherd', kind: 'horse', n: 1 }],
        winText: 'Les cavaliers ont chargé la horde de squelettes, tenu la grande galerie et remonté les filons dans leurs sacoches !',
        loseText: 'Un cheval s’est emballé dans le noir et n’est jamais revenu ; deux cavaliers rentrent blessés, les sacoches vides.',
      },
      {
        label: 'Hommes d’armes en armure', text: 'Lents et lourds : ils avancent bouclier contre bouclier et tiennent chaque galerie le temps qu’on la vide.',
        dest: 'cave', scene: 'mine', doing: 'avance bouclier contre bouclier et abat les filons', troop: 'armor', danger: ['monster', 'dark', 'fall'], party: 5, work: 48, risk: 0.45, carry: 'cart',
        win: [{ t: 'veins', n: 6 }], lose: [hurt(2, 4)],
        winText: 'Pas un monstre n’a percé le mur de boucliers : six filons abattus, le chariot ploie sous le minerai.',
        loseText: 'Les araignées géantes ont attaqué par le plafond : la troupe a reculé, deux blessés sous leurs armures cabossées.',
      },
      {
        label: 'Mineurs et quelques gardes', text: 'Peu de soldats, beaucoup de pioches : on file droit aux premiers filons et on remonte ce qu’on peut.',
        dest: 'cave', scene: 'mine', doing: 'abat les filons sous la garde des soldats', troop: 'miners', danger: ['monster', 'dark'], party: 4, work: 40, risk: 0.55, carry: 'cart',
        win: [{ t: 'veins', n: 3 }], lose: [hurt(2, 3)],
        winText: 'Les gardes ont tenu bon pendant que les pioches chantaient : trois filons remontés à la lumière.',
        loseText: 'Des zombies ont surgi d’une galerie latérale : les mineurs ont tout lâché pour fuir, deux blessés.',
      },
    ],
  },
  {
    id: 'wolf', age: 2, mandatory: false, icon: '🐺', title: 'Le loup des bois',
    intro: 'Un loup rôde autour des enclos la nuit. Les bergers ne dorment plus.',
    choices: [
      {
        label: 'Le chasser avec les chiens', text: 'Il faudra le pister loin dans la forêt.',
        dest: 'forest', scene: 'hunt', doing: 'piste le loup avec les chiens', danger: ['beast'], party: 3, work: 18, risk: 0.3,
        win: [joy(3)], lose: [hurt(1, 2)],
        winText: 'Le loup est parti loin dans la montagne : les bergers dorment enfin.',
        loseText: 'Le loup s’est défendu : un chasseur mordu, et le loup toujours là.',
      },
      {
        label: 'Bâtir des enclos de pierre sèche', text: 'Pas de chasse : on protège les bêtes.',
        dest: 'plain', scene: 'build', doing: 'monte des murets de pierre sèche', party: 2, work: 24, risk: 0.05, carry: 'cart',
        win: [joy(2), food(1)], lose: [],
        winText: 'De beaux enclos de pierre : le loup peut toujours rôder.',
        loseText: 'Les pierres manquaient : les enclos attendront.',
      },
    ],
  },
  {
    id: 'fair', age: 2, mandatory: false, icon: '🎪', title: 'Les jongleurs du carrefour',
    intro: 'Une troupe de jongleurs et de musiciens passe dans la région. Il faudrait aller les chercher au grand carrefour.',
    choices: [
      {
        label: 'Aller à leur rencontre', text: 'Une belle balade, avec un peu de chance au bout.',
        dest: 'far', scene: 'troupe', doing: 'applaudit les jongleurs et les invite au village', danger: ['weather'], party: 2, work: 10, risk: 0.15,
        win: [joy(5, 5)], lose: [],
        winText: 'La troupe est arrivée en musique : fête au village pendant des jours !',
        loseText: 'Ils étaient déjà partis vers une autre ville…',
      },
    ],
  },
  {
    id: 'brewer', age: 2, mandatory: false, icon: '🍺', title: 'Le maître brasseur', unlocks: 'tavern',
    intro: 'À l’abbaye voisine, un frère brasse une bière dont on parle jusqu’au château. S’il nous apprenait son secret, le village aurait sa taverne.',
    choices: [
      {
        label: 'Aller l’écouter à l’abbaye', text: 'Une longue route, et des moines qui aiment qu’on les écoute.',
        dest: 'far', scene: 'abbey', doing: 'écoute le frère brasseur et goûte sa bière', danger: ['weather'], party: 2, work: 16, risk: 0.1,
        win: [joy(2)], lose: [],
        winText: 'Le frère a tout expliqué, de l’orge germée au houblon : la première taverne du village peut ouvrir.',
        loseText: 'Le frère était en retraite, et l’abbaye fermée aux visiteurs.',
      },
      {
        label: 'Cueillir le houblon sauvage au bord de l’eau', text: 'On rapporte le houblon d’abord ; le frère viendra goûter.',
        dest: 'river', scene: 'hops', doing: 'cueille le houblon sauvage', party: 3, work: 18, risk: 0.2, carry: 'sacks',
        win: [joy(1), food(1)], lose: [hurt(1, 1)],
        winText: 'Des sacs de houblon embaumé : le frère est venu en personne, et la taverne a ouvert le soir même.',
        loseText: 'Une glissade dans les orties : un cueilleur blessé, le houblon perdu.',
      },
    ],
  },
  // ---------------- Âge industriel ----------------
  {
    id: 'railway', age: 3, mandatory: true, icon: '🚂', title: 'Le tracé du chemin de fer',
    intro: 'Le chemin de fer arrive dans la région. Des géomètres doivent repérer le meilleur tracé jusqu’au village.',
    choices: [
      {
        label: 'Par la plaine, en contournant tout', text: 'Le plus long, le plus sûr.',
        dest: 'plain', scene: 'rails', doing: 'pose la voie ferrée à travers la plaine', party: 3, work: 26, risk: 0.1,
        win: [jobs(4), joy(1)], lose: [],
        winText: 'Le tracé le plus long, mais le plus sûr : les ouvriers arrivent en nombre.',
        loseText: 'Les relevés étaient faux : il faudra recommencer.',
      },
      {
        label: 'Percer un tunnel sous la montagne', text: 'Audacieux, et les déblais pourraient rapporter.',
        dest: 'mountain', scene: 'gallery', doing: 'perce le tunnel et sort les déblais', party: 4, work: 30, risk: 0.35, carry: 'cart',
        win: [jobs(5), { t: 'ore', n: 8 }], lose: [hurt(2, 3)],
        winText: 'Le tunnel est percé ! En prime, les déblais regorgent de charbon et de fer.',
        loseText: 'Un éboulement dans le tunnel : deux ouvriers blessés.',
      },
      {
        label: 'Jeter un pont sur la rivière', text: 'Un ouvrage d’art qu’on viendra voir de loin.',
        dest: 'river', scene: 'bridge', doing: 'jette le pont sur la rivière', danger: ['water', 'fall'], party: 3, work: 22, risk: 0.2,
        win: [jobs(4), joy(2)], lose: [hurt(1, 2)],
        winText: 'Le pont de fer enjambe la rivière : on vient l’admirer de toute la région !',
        loseText: 'Une poutre a glissé : un ouvrier blessé.',
      },
    ],
  },
  {
    id: 'coal', age: 3, mandatory: false, icon: '🏭', title: 'Prospection de charbon',
    intro: 'Les machines ont faim. On murmure qu’une veine de charbon affleure quelque part.',
    choices: [
      {
        label: 'Sonder la montagne', text: 'Des carottages patients.',
        dest: 'mountain', scene: 'drill', doing: 'carotte la roche à la recherche du charbon', party: 3, work: 22, risk: 0.15, carry: 'cart',
        win: [{ t: 'ore', n: 8 }], lose: [],
        winText: 'Une belle veine : les wagonnets rentrent pleins.',
        loseText: 'Rien que de la roche stérile.',
      },
      {
        label: 'Descendre dans la grotte', text: 'Plus riche, plus dangereux.',
        dest: 'cave', scene: 'cave', doing: 'descend dans la grotte, lampe au front', party: 3, work: 18, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }], lose: [hurt(1, 2)],
        winText: 'La grotte cachait une veine énorme !',
        loseText: 'Un coup de grisou : un prospecteur blessé.',
      },
    ],
  },
  // ---------------- Époque moderne ----------------
  {
    id: 'summit', age: 4, mandatory: true, icon: '🏔️', title: 'Expédition au sommet',
    intro: 'Des scientifiques veulent installer une station météo au sommet de la plus haute montagne. Le village fournit le guide et les porteurs.',
    choices: [
      {
        label: 'Par la crête, en un jour', text: 'Vite fait, si le vent le permet.',
        dest: 'mountain', scene: 'summit', doing: 'plante le drapeau et monte la station météo', party: 3, work: 20, risk: 0.35, carry: 'sacks',
        win: [joy(4), jobs(2)], lose: [hurt(1, 2)],
        winText: 'Drapeau au sommet ! La station envoie déjà ses premières mesures.',
        loseText: 'Le vent a forcé la cordée à redescendre ; un porteur s’est tordu la cheville.',
      },
      {
        label: 'Par la vallée, avec un camp de base', text: 'Lentement mais sûrement.',
        dest: 'far', scene: 'basecamp', doing: 'monte le camp de base, puis la station au sommet', danger: ['weather', 'fall'], party: 4, work: 30, risk: 0.1, carry: 'sacks',
        win: [joy(3), jobs(3)], lose: [],
        winText: 'La station est installée, et le village a sa photo dans le journal.',
        loseText: 'Le mauvais temps a tout reporté.',
      },
    ],
  },
  {
    id: 'reef', age: 4, mandatory: false, icon: '🐠', title: 'Le récif',
    intro: 'Des plongeurs aimeraient étudier le récif, plus loin sur la côte.',
    choices: [
      {
        label: 'Partir avec les plongeurs', text: 'Masques, tubas et pique-nique.',
        dest: 'river', scene: 'dive', doing: 'plonge sur le récif avec les plongeurs', party: 2, work: 16, risk: 0.1,
        win: [joy(3)], lose: [],
        winText: 'Des photos magnifiques : tout le village veut aller voir les poissons.',
        loseText: 'L’eau était trouble : on n’a rien vu.',
      },
    ],
  },
  {
    id: 'stars', age: 4, mandatory: false, icon: '🔭', title: 'La pluie d’étoiles', unlocks: 'observatory',
    intro: 'Les astronomes annoncent une pluie d’étoiles filantes. Si le village les aide à monter leurs instruments au bon endroit, ils y bâtiront un observatoire.',
    choices: [
      {
        label: 'Monter les lunettes au sommet', text: 'Le ciel le plus pur… et le plus long portage.',
        dest: 'mountain', scene: 'stars', doing: 'observe la pluie d’étoiles filantes', danger: ['fall', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [joy(3)], lose: [hurt(1, 2)],
        winText: 'Toute la nuit, le ciel a plu des étoiles : les astronomes ont choisi la place de leur observatoire.',
        loseText: 'Un faux pas dans les éboulis : une lunette brisée et un porteur blessé.',
      },
      {
        label: 'Chercher la météorite tombée dans la plaine', text: 'Elle est tombée la nuit dernière, quelque part par là.',
        dest: 'far', scene: 'crater', doing: 'dégage la météorite de son cratère', party: 2, work: 16, risk: 0.15, carry: 'cart',
        win: [joy(2), { t: 'ore', n: 4 }], lose: [],
        winText: 'La météorite fumait encore au fond de son trou : du fer tombé du ciel, et un observatoire promis au village !',
        loseText: 'Rien qu’un rocher ordinaire… la météorite est tombée ailleurs.',
      },
    ],
  },
];

/** Jours que durent, quand on refait une mission déjà réussie, les bonus qui étaient durables la première fois */
export const REDO_DAYS = 4;

/**
 * Ce que rapporte une mission refaite : de nouveau des bêtes, du minerai, des vivres pour quelques jours… mais ses bonus
 * durables (travail, bien-être) ne durent plus que quelques jours, et son savoir-faire est déjà acquis
 */
export function redoEffects(effects: Effect[]): Effect[] {
  return effects.filter((e) => e.t !== 'perk').map((e) => (e.t === 'need' && !e.days ? { ...e, days: REDO_DAYS } : e));
}

/** Bêtes par enclos, chevaux par écurie, au plus */
export const PEN_CAP = 6;
export const STABLE_CAP = 4;

/**
 * Bêtes de chaque écurie et de chaque enclos (dans l'ordre où ils ont été bâtis) : les chevaux vont d'abord à l'écurie, le
 * reste du troupeau (et les chevaux en trop) dans les enclos ; celles qui, faute de place, paissent près des fermes
 */
export function penHerds(w: World) {
  const all = (k: KindId) => [...w.buildings.values()].filter((b) => b.kind === k).sort((a, b) => a.id - b.id);
  const horses = w.exp.herd.filter((k) => k === 'horse').slice(w.exp.riding), stables = new Map<number, HerdKind[]>(), pens = new Map<number, HerdKind[]>();
  let h = 0;
  for (const s of all('stable')) { stables.set(s.id, horses.slice(h, h + STABLE_CAP)); h += STABLE_CAP; }
  const herd = [...w.exp.herd.filter((k) => k !== 'horse'), ...horses.slice(h)];
  let i = 0;
  for (const p of all('pen')) { pens.set(p.id, herd.slice(i, i + PEN_CAP)); i += PEN_CAP; }
  return { pens, stables, rest: herd.slice(i) };
}

/** La mission obligatoire de l'âge (celle qui ouvre l'âge suivant) */
export const mandatoryFor = (age: number) => MISSIONS.find((m) => m.age === age && m.mandatory) ?? null;

/** État des expéditions, sauvegardé avec le monde */
export interface ExpState {
  /** missions réussies */
  done: string[];
  /** savoir-faire durables */
  perks: string[];
  /** bêtes ramenées, qui paissent près des fermes */
  herd: HerdKind[];
  /** bonus durables par besoin */
  bonus: Record<NeedKey, number>;
  /** effets passagers (jusqu'à l'horloge `until`, en secondes de jeu) */
  temp: { need: NeedKey; n: number; until: number }[];
  /** horloge des expéditions (secondes de jeu écoulées) */
  clock: number;
  /** équipement en réserve (celui des équipes en route n'y est pas) */
  gear: Stock;
  /** fabrication en cours, dans l'ordre, et avancement de la première pièce (secondes de jeu) */
  craft: GearId[];
  craftT: number;
  /** chevaux partis avec une troupe (pas sauvegardé : une expédition en route ne l'est pas) */
  riding: number;
}

export const newExpState = (): ExpState => ({ done: [], perks: [], herd: [], bonus: { food: 0, water: 0, jobs: 0, joy: 0 }, temp: [], clock: 0, gear: emptyStock(), craft: [], craftT: 0, riding: 0 });

/** Relit l'état sauvegardé (anciennes sauvegardes : état vierge) */
export function readExpState(d: any): ExpState {
  const s = newExpState();
  if (!d || typeof d !== 'object') return s;
  const ids = new Set(MISSIONS.map((m) => m.id));
  s.done = Array.isArray(d.done) ? d.done.filter((x: any) => ids.has(x)) : [];
  s.perks = Array.isArray(d.perks) ? d.perks.filter((x: any) => typeof x === 'string') : [];
  s.herd = Array.isArray(d.herd) ? d.herd.filter((x: any) => ['sheep', 'cow', 'pig', 'horse'].includes(x)) : [];
  for (const k of Object.keys(s.bonus) as NeedKey[]) s.bonus[k] = +d.bonus?.[k] || 0;
  s.temp = Array.isArray(d.temp) ? d.temp.filter((t: any) => t && t.need in s.bonus && isFinite(t.n) && isFinite(t.until)) : [];
  s.clock = +d.clock || 0;
  for (const k of Object.keys(s.gear) as GearId[]) s.gear[k] = Math.max(0, Math.floor(+d.gear?.[k] || 0));
  s.craft = Array.isArray(d.craft) ? d.craft.filter((x: any) => x in GEAR_BY) : [];
  s.craftT = +d.craftT || 0;
  return s;
}

/** Bonus d'un besoin en ce moment : durable plus passager */
export function needBonus(s: ExpState, need: NeedKey) {
  let n = s.bonus[need];
  for (const t of s.temp) if (t.need === need && t.until > s.clock) n += t.n;
  return n;
}

/** Applique les effets au monde ; renvoie les blessés (que l'expédition renvoie se reposer chez eux) */
export function applyEffects(w: World, effects: Effect[], dayLen: number) {
  const s = w.exp;
  let injured = 0, days = 0;
  for (const e of effects) {
    if (e.t === 'herd') s.herd.push(...e.kinds);
    else if (e.t === 'ore') w.ore += e.n;
    else if (e.t === 'perk') { if (!s.perks.includes(e.id)) s.perks.push(e.id); }
    else if (e.t === 'need') { if (e.days) s.temp.push({ need: e.need, n: e.n, until: s.clock + e.days * dayLen }); else s.bonus[e.need] += e.n; }
    else if (e.t === 'injured') { injured += e.n; days = Math.max(days, e.days); }
    else if (e.t === 'unherd') for (let i = 0; i < e.n; i++) { const j = s.herd.lastIndexOf(e.kind); if (j >= 0) s.herd.splice(j, 1); }
  }
  w.version++;
  return { injured, days };
}

const NEED_ICON: Record<NeedKey, string> = { food: '🍞', water: '💧', jobs: '🔨', joy: '😊' };
const HERD_NAME: Record<HerdKind, [string, string]> = { sheep: ['mouton', 'moutons'], cow: ['vache', 'vaches'], pig: ['cochon', 'cochons'], horse: ['cheval', 'chevaux'] };
const PERK_NAME: Record<string, string> = { seeds: 'blé des collines : champs +30 %' };

/** Les effets en quelques mots (« 4 moutons · +3 🍞 · 1 blessé ») */
export function effectSummary(effects: Effect[]) {
  const out: string[] = [];
  for (const e of effects) {
    if (e.t === 'herd') {
      const n: Partial<Record<HerdKind, number>> = {};
      for (const k of e.kinds) n[k] = (n[k] ?? 0) + 1;
      for (const [k, c] of Object.entries(n) as [HerdKind, number][]) out.push(`${c} ${HERD_NAME[k][c > 1 ? 1 : 0]}`);
    } else if (e.t === 'ore') out.push(`+${e.n} minerai`);
    else if (e.t === 'need') out.push(`${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} ${NEED_ICON[e.need]}${e.days ? ` (${e.days} j)` : ''}`);
    else if (e.t === 'perk') out.push(PERK_NAME[e.id] ?? e.id);
    else if (e.t === 'injured') out.push(`${e.n} blessé${e.n > 1 ? 's' : ''} (${e.days} j)`);
    else if (e.t === 'veins') out.push(`${e.n} filons du souterrain`);
    else if (e.t === 'unherd') out.push(`−${e.n} ${HERD_NAME[e.kind][e.n > 1 ? 1 : 0]}`);
  }
  return out.join(' · ') || 'rien';
}
