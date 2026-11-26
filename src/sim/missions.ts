import type { World } from '../world/world';
import { Danger, GearId, Stock, emptyStock, GEAR_BY } from './gear';
import type { KindId } from '../build/catalog';
import { tr, plural } from '../i18n';
import { applyDiplo, claimVictory, DiploAct, addBoon, BoonKind, IsleWhen } from './diplomacy';
import { ISLE_MISSIONS } from './isleMissions';
import { grantLegacies } from './legacy';

/**
 * Expéditions : à chaque âge, des missions à choix (au moins une obligatoire pour passer à l'âge suivant, deux à la
 * Préhistoire : apprivoiser des bêtes et chasser le mammouth). Une petite équipe
 * d'habitants part sur la carte (forêt, plaine, rivière, montagne, grotte, au-delà des collines), agit sur place et revient ;
 * selon le choix et la chance, le village y gagne des bêtes, du minerai, des savoir-faire… ou des blessés et des soucis. À
 * l'âge futuriste, la fin de la partie : trois expéditions spatiales parties du cosmodrome, chacune ouvrant la suivante
 */

/** Où l'équipe se rend */
export type DestKind = 'plain' | 'forest' | 'river' | 'mountain' | 'cave' | 'far' | 'spaceport';
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
  | 'troupe' | 'abbey' | 'stars' | 'crater' | 'bridge' | 'drill' | 'summit' | 'basecamp' | 'dive'
  // la course automobile, la montgolfière qu'on gonfle
  | 'race' | 'balloon'
  // la chasse au mammouth : les fosses, le ravin ou la harde qu'on suit de loin (selon la destination)
  | 'mammoth'
  // le premier vol de fusée, la fusée lunaire (et l'alunissage en direct), le départ du vaisseau colonial
  | 'launch' | 'moon' | 'colony'
  // la chasse en mer : le mégalodon (aileron géant) et le kraken (tentacules), la galère et ses harpons
  | 'megalodon' | 'kraken'
  // le dragon dans sa grotte (Moyen Âge) ; les grands Jeux au stade (époque moderne)
  | 'dragon' | 'games'
  // la traversée en galère jusqu'à l'île du portail, qu'on explore et dont on réveille l'arche
  | 'portal'
  // l'entraînement au pugilat : le cercle de sable, deux boxeurs qui s'affrontent à tour de rôle, le vieux champion
  | 'pugilat'
  // le volet maritime : voyage de découverte ou de commerce au large, chasse à l'épave, pêche en haute mer
  | 'voyage' | 'wreck' | 'trawl'
  // les îles flottantes de l'âge futuriste (archipel de plateformes, balises, cultures, drone-barge)
  | 'isles'
  // les éclaireurs de l'archipel : la barque traverse jusqu'à l'île rivale, l'équipe débarque et observe ses défenses
  | 'scout'
  // le volcan : l'obsidienne au pied des coulées, la montée au cratère, le village sauvé de l'éruption (voir `VOLCANIC`)
  | 'obsidian' | 'ascent' | 'eruption'
  // la chasse légendaire au cerf blanc, dans la forêt (Moyen Âge) : la meute qui le lève, ou l'affût
  | 'stag';

/**
 * Ce que montre un échec, quand l'équipe repart : l'orage ou la brume, des pierres qui dévalent, la pirogue qui chavire, la
 * harde qui s'enfuit, une bête qui charge, les abeilles en furie, le coup de grisou, les torches qui s'éteignent, les voisins
 * qui s'en vont, les oiseaux qui s'envolent des buissons pillés, la tempête de neige où la harde disparaît
 */
export type Fail = 'storm' | 'fog' | 'rocks' | 'capsize' | 'scatter' | 'charge' | 'stings' | 'blast' | 'dark' | 'gone' | 'birds' | 'blizzard';

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
  /** bêtes perdues en route */
  | { t: 'unherd'; kind: HerdKind; n: number }
  /** la diplomatie de l'archipel avance : peuples rencontrés, comptoir chez le rival, trêve, fête (voir `diplomacy.ts`) */
  | { t: 'diplo'; act: DiploAct }
  /**
   * un avantage pour le dénouement de l'archipel (expéditions facultatives des îles, voir `Boons`) : troupes alliées, nos
   * soldats, ennemis en moins à la bataille, chances de la paix
   */
  | { t: 'boon'; kind: BoonKind; n: number }
  /** de l'or (l'archipel : il sert à passer les âges) */
  | { t: 'gold'; n: number };


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
  /**
   * ce que l'équipe rapporte, visible au retour : des bêtes qui la suivent, un chariot, des sacs sur le dos, ses invités, le
   * traîneau chargé de viande et de peaux
   */
  carry?: 'animals' | 'cart' | 'sacks' | 'guests' | 'sledge' | 'refugees';
  /**
   * l'équipe prend la mer : au large, sur l'eau profonde, plus loin que la rive (sinon, faute de mer à portée, elle reste sur
   * la rivière la plus proche)
   */
  sea?: boolean;
  /** ce que l'équipe fait sur place, et ce qu'en dit sa carte (« troque ses poteries contre des semences ») */
  scene: Scene;
  doing?: string;
  /** dangers rencontrés (sinon ceux de la destination) : l'équipement qui les pare rend le choix plus sûr */
  danger?: Danger[];
  /**
   * une troupe armée (les éclaireurs de l'archipel : `cavalry`) : l'expédition compte comme militaire (`isMilitary`), elle
   * part à pied, sans chevaux de l'écurie ni voiture ni aéronef
   */
  troop?: 'cavalry' | 'armor' | 'miners';
  /** ce qu'on voit de l'échec sur la scène, au départ de l'équipe (l'orage, la pirogue qui chavire, la pierre qui roule…) */
  fail?: Fail;
  /**
   * un aller sans retour (les éclaireurs de l'archipel) : l'expédition s'achève là-bas, à la fin du travail ; l'équipe ne
   * rentre pas à l'écran (elle rejoint les troupes) et le récit arrive aussitôt, sans fête au village
   */
  oneWay?: boolean;
  /**
   * une variante du décor, lue par l'écran et non par le libellé (qu'on peut renommer ou traduire) : `craters`, l'alunissage
   * au bord des cratères (retransmission) ; `warp`, le saut à travers l'espace (grand voyage de la colonie) ; `diver`, le
   * scaphandrier qui descend à l'épave ; `smoke`, le grand feu devant la grotte du dragon ; `hot`, la coulée encore tiède où
   * l'on taille l'obsidienne ; `lava`, la descente au bord du lac de lave ; `trench`, la tranchée qui détourne la coulée ;
   * `stalk`, l'affût où l'on guette le cerf blanc (sinon on le court avec la meute)
   */
  variant?: 'craters' | 'warp' | 'diver' | 'smoke' | 'ally' | 'islet' | 'ship' | 'hot' | 'lava' | 'trench' | 'stalk';
  /**
   * une visite sur les îles de l'archipel (expéditions facultatives, `isleMissions.ts`) : chez qui, où (un point de sa ville,
   * `offport` : au large de son port, sans débarquer ; `islet` : la petite île la plus proche), et ce qu'on y voit (`look`)
   */
  visit?: IsleVisit;
  win: Effect[];
  lose: Effect[];
  winText: string;
  loseText: string;
}

/** Où va une visite sur les îles, et ce qu'on y voit (voir `ExpeditionScene.tripSetup`) */
export interface IsleVisit {
  to: 'ally' | 'rival';
  at: 'marche' | 'port' | 'temple' | 'palais' | 'plage' | 'gate' | 'islet' | 'offport';
  look: 'fair' | 'dice' | 'cargo' | 'carpentry' | 'forge' | 'swap' | 'race' | 'reef' | 'spyglass' | 'eavesdrop' | 'beach' | 'escort' | 'ropes' | 'fireship' | 'buy' | 'steal';
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
  /** ce qu'il faut avant de partir : missions réussies, bâtiments bâtis */
  requires?: { missions?: string[]; kinds?: KindId[] };
  /**
   * le grand départ (les colons vers une autre planète) : tout le village les accompagne et les acclame, ils ne reviennent
   * pas, et l'expédition ne peut pas échouer
   */
  farewell?: boolean;
  /**
   * des pourparlers (la paix de l'archipel) : jamais de blessé, un échec qui ne coûte rien (son risque : `talkRisk`, la bonne volonté gagnée sur les îles) ; seuls les imprévus propres à
   * la mission surviennent. Une étape réussie ne se refait pas
   */
  talks?: boolean;
  /**
   * une expédition facultative sur les îles de l'archipel (voir `isleMissions.ts`) : quand elle est proposée (`IsleWhen`) ;
   * `to` : chez l'allié ou chez le rival
   */
  isle?: { when: IsleWhen; to: 'ally' | 'rival' };
}

/**
 * L'embarcation de l'expédition, selon l'âge du village : la pirogue creusée dans un tronc, la barque à rames, le voilier, le
 * bateau à vapeur à roues, la vedette, l'hydroglisseur futuriste ; une troupe armée prend la galère à rames (jusqu'au Moyen Âge)
 */
export type BoatKind = 'canoe' | 'rowboat' | 'sail' | 'steam' | 'launch' | 'hover' | 'galley';
export const BOAT_NAME: Record<BoatKind, string> = { canoe: 'pirogue', rowboat: 'barque', sail: 'voilier', steam: 'bateau à vapeur', launch: 'vedette', hover: 'hydroglisseur', galley: 'galère' };
const BOATS: BoatKind[] = ['canoe', 'rowboat', 'sail', 'steam', 'launch', 'hover'];
export function boatKindFor(age: number, war = false): BoatKind {
  if (war && age <= 2) return 'galley';
  return BOATS[Math.max(0, Math.min(BOATS.length - 1, Math.floor(age) || 0))];
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
        label: 'Suivre le troupeau dans la plaine', text: 'Long mais sûr : on marche avec les moutons.',
        dest: 'plain', scene: 'herd', fail: 'storm', doing: 'marche avec les moutons jusqu’à ce qu’ils se laissent approcher', party: 3, work: 24, risk: 0.15, carry: 'animals',
        win: [{ t: 'herd', kinds: ['sheep', 'sheep', 'sheep', 'sheep'] }, food(3)], lose: [],
        winText: 'Le troupeau a suivi les chasseurs jusqu’au camp, sans se presser. Les moutons broutent maintenant près des fermes.',
        loseText: 'Un orage a éclaté et dispersé le troupeau. Les chasseurs rentrent bredouilles, mais ils retenteront leur chance.',
      },
      {
        label: 'Bâtir un enclos de branchages en lisière', text: 'On rabat les bêtes de la forêt dans un enclos.',
        dest: 'forest', scene: 'corral', fail: 'charge', doing: 'rabat les bêtes dans un enclos de branchages', party: 4, work: 30, risk: 0.25, carry: 'animals',
        win: [{ t: 'herd', kinds: ['pig', 'pig', 'pig', 'sheep', 'sheep'] }, food(4)], lose: [hurt(1, 2)],
        winText: 'L’enclos a tenu : sangliers et moutons ont été menés au village, et ils s’y plaisent.',
        loseText: 'Un sanglier a forcé l’enclos et blessé un chasseur. Il se repose à la hutte.',
      },
      {
        label: 'Attirer les aurochs avec du sel', text: 'Rapide mais risqué : les aurochs viennent lécher le sel.',
        dest: 'river', scene: 'salt', fail: 'charge', doing: 'attend, cachée, que les aurochs viennent lécher le sel', danger: ['beast', 'water'], party: 2, work: 14, risk: 0.4, carry: 'animals',
        win: [{ t: 'herd', kinds: ['cow', 'cow', 'sheep'] }, food(4)], lose: [hurt(1, 3), joy(-2, 2)],
        winText: 'Le sel a fait merveille : deux aurochs, doux comme des agneaux, ont suivi les chasseurs jusqu’au camp.',
        loseText: 'Un aurochs a chargé ! Un chasseur est blessé, et le camp a eu très peur.',
      },
    ],
  },
  {
    id: 'berries', age: 0, mandatory: false, icon: '🍇', title: 'La grande cueillette', unlocks: 'hedge',
    intro: 'Les baies mûrissent dans les bois et le long de l’eau. De quoi faire des réserves pour quelques jours.',
    choices: [
      {
        label: 'Partir en forêt', text: 'Des buissons à perte de vue, à condition d’arriver avant les oiseaux.',
        dest: 'forest', scene: 'gather', fail: 'birds', doing: 'cueille les baies de buisson en buisson', party: 2, work: 16, risk: 0.15, carry: 'sacks',
        win: [food(4, 4)], lose: [],
        winText: 'Les paniers débordent de baies et de noisettes : on mange bien pour quelques jours.',
        loseText: 'Les oiseaux étaient passés avant : il ne restait presque rien.',
      },
      {
        label: 'Remonter la rivière', text: 'Baies, cresson… et peut-être une baignade.',
        dest: 'river', scene: 'gather', doing: 'cueille des baies au bord de l’eau', party: 2, work: 12, risk: 0.2, carry: 'sacks',
        win: [food(3, 4), joy(1, 4)], lose: [hurt(1, 1)],
        winText: 'Baies, cresson et une baignade : tout le monde rentre content.',
        loseText: 'Une glissade sur les galets : une cheville foulée, rien de grave.',
      },
    ],
  },
  {
    id: 'flint', age: 0, mandatory: false, icon: '⛏️', title: 'La chasse au silex', unlocks: 'statue',
    intro: 'Au pied de la montagne, la falaise est pleine de silex, et la rivière en roule des galets. Avec de meilleurs outils, tout le monde travaillerait mieux.',
    choices: [
      {
        label: 'Escalader la falaise', text: 'Les plus beaux rognons sont en hauteur.',
        dest: 'mountain', scene: 'mine', fail: 'rocks', doing: 'détache les rognons de silex de la falaise', party: 3, work: 20, risk: 0.25, carry: 'sacks',
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
        dest: 'forest', scene: 'smoke', fail: 'stings', doing: 'enfume le vieux chêne pour endormir l’essaim', danger: ['beast'], party: 2, work: 14, risk: 0.3, carry: 'sacks',
        win: [food(2), joy(1)], lose: [hurt(1, 1)],
        winText: 'L’essaim, endormi par la fumée, a été rapporté dans un tronc creux : les premières ruches bourdonnent près du camp.',
        loseText: 'Les abeilles se sont réveillées : des piqûres en pagaille, un cueilleur gonflé comme une outre.',
      },
      {
        label: 'Suivre les abeilles jusqu’à leur essaim', text: 'Patient : on suit leur vol jusqu’à un essaim.',
        dest: 'plain', scene: 'swarm', doing: 'recueille l’essaim posé sur une branche', party: 3, work: 22, risk: 0.12, carry: 'sacks',
        win: [food(3, 4)], lose: [],
        winText: 'Au bout de la piste, un essaim tout neuf accroché à une branche basse : on l’a cueilli sans une piqûre.',
        loseText: 'Les abeilles volaient trop haut : on les a perdues de vue.',
      },
    ],
  },
  {
    // la seconde mission obligatoire de la Préhistoire : un traîneau de viande et de peaux, et la fête au retour
    // (l'éléphant plutôt que le mammouth 🦣, que Windows 10 n'affiche pas)
    id: 'mammoth', age: 0, mandatory: true, icon: '🐘', title: 'Chasser le mammouth',
    intro: 'Une harde de mammouths passe non loin du camp. Un seul de ces géants nourrirait tout le monde, et ses peaux tiendraient chaud tout l’hiver… mais ça se chasse à plusieurs, et avec ruse.',
    choices: [
      {
        label: 'Pièges et fosses', text: 'Long mais sûr : on creuse des fosses sur son passage.',
        dest: 'plain', scene: 'mammoth', fail: 'scatter', doing: 'creuse des fosses sur le passage de la harde et guette les mammouths', danger: ['beast', 'weather'], party: 4, work: 30, risk: 0.2, carry: 'sledge',
        win: [food(6, 6), food(2), joy(2, 5), joy(1), { t: 'perk', id: 'furs' }], lose: [],
        winText: 'Le vieux mâle s’est pris les pattes dans une fosse : les chasseurs rentrent, le traîneau chargé de viande et de peaux. Ce soir, grande fête autour du feu !',
        loseText: 'La harde a flairé les fosses et fait un grand détour. Les chasseurs rentrent les mains vides, mais les fosses attendront la prochaine fois.',
      },
      {
        label: 'Rabattre la harde vers le ravin', text: 'Rapide mais risqué : torches et cris, vers un ravin.',
        dest: 'mountain', scene: 'mammoth', fail: 'charge', doing: 'rabat la harde vers le ravin, torches et lances en main', danger: ['beast', 'fall'], party: 5, work: 18, risk: 0.4, carry: 'sledge',
        win: [food(8, 6), food(2), joy(3, 5), joy(1), { t: 'perk', id: 'furs' }], lose: [hurt(2, 2), joy(-1, 3)],
        winText: 'La harde a dévalé la pente et le vieux mâle est resté coincé au fond du ravin : jamais le camp n’a vu autant de viande et de fourrures !',
        loseText: 'Le vieux mâle a fait volte-face et chargé les rabatteurs : deux chasseurs sont blessés, et la harde s’est enfuie dans la montagne.',
      },
      {
        label: 'Suivre la harde à distance', text: 'Patient : on suit la harde sans se montrer.',
        dest: 'far', scene: 'mammoth', fail: 'blizzard', doing: 'suit la harde à distance et encercle le vieux mâle', party: 3, work: 26, risk: 0.25, carry: 'sledge',
        win: [food(5, 6), food(2), joy(2, 5), joy(1), { t: 'perk', id: 'furs' }], lose: [hurt(1, 1)],
        winText: 'Le vieux mâle, à bout de souffle, s’est couché loin derrière la harde : les chasseurs rentrent, le traîneau plein de viande et de peaux.',
        loseText: 'Une tempête de neige a effacé les traces : la harde s’est évanouie au-delà des collines, et un chasseur rentre en boitant.',
      },
    ],
  },
  // ---------------- Antiquité ----------------
  {
    id: 'seeds', age: 1, mandatory: true, icon: '🌾', title: 'Le blé des collines',
    intro: 'Au-delà des collines, un village cultive un blé géant. Il faudrait en rapporter des semences.',
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
        dest: 'river', scene: 'boat', fail: 'capsize', doing: 'descend la rivière en pirogue', party: 2, work: 12, risk: 0.3, carry: 'sacks',
        win: [{ t: 'perk', id: 'seeds' }, food(2)], lose: [hurt(1, 2)],
        winText: 'Le courant a porté les pirogues jusqu’au village voisin, et les semences sont rentrées bien sèches.',
        loseText: 'Une pirogue a chaviré dans les rapides : un rameur blessé, les semences perdues.',
      },
      {
        label: 'Passer par le col de la montagne', text: 'Le raccourci des chèvres : on pourrait y trouver autre chose.',
        dest: 'mountain', scene: 'pass', fail: 'fog', doing: 'franchit le col et ramasse les pierres vertes', party: 3, work: 16, risk: 0.3, carry: 'cart',
        win: [{ t: 'perk', id: 'seeds' }, { t: 'ore', n: 3 }], lose: [hurt(1, 3)],
        winText: 'Par le col, on a trouvé les semences… et des pierres vertes qui sentent le cuivre !',
        loseText: 'Le col était pris dans la brume. Un marcheur s’est blessé en chutant.',
      },
    ],
  },
  {
    id: 'horses', age: 1, mandatory: false, icon: '🐎', title: 'Les chevaux sauvages', unlocks: 'stable',
    intro: 'Une harde de chevaux galope dans la plaine. Montés ou attelés, ils changeraient la vie du village.',
    choices: [
      {
        label: 'Les approcher patiemment', text: 'Des jours à se faire accepter de la harde.',
        dest: 'plain', scene: 'herd', fail: 'scatter', doing: 'se fait accepter de la harde', party: 3, work: 26, risk: 0.2, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse'] }, jobs(2)], lose: [],
        winText: 'Deux chevaux ont accepté le licol : les charrettes rouleront plus vite.',
        loseText: 'La harde s’est enfuie au galop au premier bruit.',
      },
      {
        label: 'Les rabattre dans un vallon', text: 'Plus rapide, mais un cheval affolé, ça rue.',
        dest: 'far', scene: 'roundup', fail: 'scatter', doing: 'rabat les chevaux vers le corral du vallon', danger: ['beast'], party: 4, work: 18, risk: 0.35, carry: 'animals',
        win: [{ t: 'herd', kinds: ['horse', 'horse', 'horse'] }, jobs(3)], lose: [hurt(1, 2)],
        winText: 'Trois chevaux rabattus et calmés : on se dispute déjà pour les monter.',
        loseText: 'Un coup de sabot : un cavalier blessé, et la harde envolée.',
      },
    ],
  },
  {
    id: 'fishing', age: 1, mandatory: false, icon: '🐟', title: 'Les grands bancs', unlocks: 'pond',
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
        label: 'Chercher les grands bancs au loin', text: 'Plus de poisson, plus de chemin : on prend le large.',
        dest: 'river', sea: true, scene: 'boat', fail: 'storm', doing: 'pêche au large les grands bancs', danger: ['water', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [food(5, 6), joy(1, 6)], lose: [hurt(1, 1)],
        winText: 'Les grands bancs existent bien : de quoi nourrir le village une semaine !',
        loseText: 'Un orage a renversé les filets. Un pêcheur s’est entaillé la main.',
      },
    ],
  },
  {
    id: 'springs', age: 1, mandatory: false, icon: '♨️', title: 'Les sources chaudes', unlocks: 'baths',
    intro: 'Des bergers parlent d’une eau fumante qui jaillit de la montagne et guérit les douleurs. Il faudrait trouver la source et apprendre à y bâtir des bains.',
    choices: [
      {
        label: 'Suivre la vapeur dans la montagne', text: 'La source est là-haut, au bout d’un sentier escarpé.',
        dest: 'mountain', scene: 'spring', fail: 'rocks', doing: 'se baigne dans la source chaude et regarde d’où elle jaillit', danger: ['fall', 'weather'], party: 3, work: 20, risk: 0.25,
        win: [joy(2)], lose: [hurt(1, 2)],
        winText: 'Entre les pierres, un bassin d’eau chaude fume dans l’air vif : les bâtisseurs savent maintenant faire des thermes.',
        loseText: 'Le sentier s’est effondré sous un porteur : il redescend sur une civière.',
      },
      {
        label: 'Remonter la rivière tiède', text: 'Là où l’eau devient tiède, la source n’est pas loin.',
        dest: 'river', scene: 'spring', doing: 'se baigne dans la source tiède, au milieu des roseaux', party: 2, work: 16, risk: 0.15,
        win: [joy(1), food(1)], lose: [],
        winText: 'La rivière tiède menait à une source chaude au milieu des roseaux : on y a pris un bain, et des idées.',
        loseText: 'La source n’était qu’une flaque tiède : pas de quoi y bâtir des bains.',
      },
    ],
  },
  {
    // l'entraînement au pugilat : deux par deux dans le cercle de sable, sous l'œil d'un vieux champion ; débloque l'arène
    id: 'pugilat', age: 1, mandatory: false, icon: '🥊', title: 'L’école du pugilat', unlocks: 'arena',
    intro: 'Un vieux champion, le nez cassé et les poings bandés de cuir, enseigne le pugilat aux jeunes gens. Apprenons de lui : le village rêve déjà de gradins.',
    choices: [
      {
        label: 'Suivre ses leçons', text: 'Garde haute, jeu de jambes : on apprend sans casse.',
        dest: 'plain', scene: 'pugilat', danger: ['weather'], doing: 's’entraîne au pugilat dans le cercle de sable', party: 4, work: 24, risk: 0.18,
        win: [joy(2), joy(3, 4)], lose: [hurt(1, 2)],
        winText: 'Les poings bandés de cuir, nos jeunes tiennent la garde : le village veut des gradins pour les voir combattre.',
        loseText: 'Un direct mal paré, un nez en sang : on rentre penauds.',
      },
      {
        label: 'Défier ses élèves', text: 'De vrais combats, au loin. Plus de gloire, plus de bosses.',
        dest: 'far', scene: 'pugilat', danger: ['weather'], doing: 'combat les élèves du champion devant la foule', party: 5, work: 30, risk: 0.32,
        win: [joy(3), joy(5, 6), jobs(1)], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Victoire aux points devant toute la vallée ! On parle déjà de bâtir une arène pour accueillir les combats.',
        loseText: 'Nos champions sont rentrés couverts de bosses : deux blessés.',
      },
    ],
  },
  {
    // expédition armée en haute mer : deux galères, des hommes d'armes à pied (pas de chevaux), des harpons ; l'obligatoire de
    // l'Antiquité (l'ancienne « chasse au monstre des mers », voir `readExpState`)
    id: 'kraken', age: 1, mandatory: true, icon: '🐙', title: 'Chasser le kraken',
    intro: 'Un géant à tentacules rôde au large et attrape les navires. Une troupe d’hommes d’armes embarque sur deux galères, harpons en main : il est temps de le chasser !',
    choices: [
      {
        label: 'Trancher ses tentacules', text: 'Les deux galères foncent, harpons en main. Risqué !',
        dest: 'river', sea: true, scene: 'kraken', fail: 'capsize', doing: 'tranche les tentacules du kraken, harpons en main', danger: ['monster', 'water'], party: 5, work: 38, risk: 0.55, carry: 'sacks',
        win: [food(3, 5), joy(5, 6), joy(2), { t: 'ore', n: 10 }, { t: 'perk', id: 'kraken' }], lose: [hurt(3, 4), joy(-3, 4)],
        winText: 'Le kraken a lâché les galères et fui dans les profondeurs, un tentacule en moins : la légende est née ! Des perles et du minerai remontent avec lui.',
        loseText: 'Les tentacules ont brisé les rames et secoué les galères : trois blessés, et le kraken est toujours là.',
      },
      {
        label: 'Le prendre en tenaille', text: 'Une galère de chaque côté. Plus long, plus sûr.',
        dest: 'river', sea: true, scene: 'kraken', fail: 'capsize', doing: 'prend le kraken en tenaille entre ses deux galères', danger: ['monster', 'water'], party: 6, work: 44, risk: 0.45, carry: 'sacks',
        win: [food(3, 5), joy(4, 6), joy(2), { t: 'ore', n: 8 }, { t: 'perk', id: 'kraken' }], lose: [hurt(2, 4), joy(-2, 4)],
        winText: 'Pris entre les deux galères, le kraken a plongé pour ne plus revenir : la légende est née ! Des perles et du minerai remontent avec lui.',
        loseText: 'Le kraken a glissé entre les deux galères et en a secoué une : deux blessés, et il rôde toujours.',
      },
    ],
  },
  {
    // l'île du portail (voir `world/portal.ts`) : la galère traverse le bras de mer, l'équipe débarque, explore l'île et
    // réveille le portail. Plus proposée depuis le grand choix de la fin de l'Antiquité (`sim/crossroads.ts`), qui ouvre le
    // portail sans elle : gardée pour une ancienne partie qui l'a en route (`Expeditions.list`), et pour `exp.done`
    id: 'portal', age: 1, mandatory: false, icon: '🌀', title: 'Le portail de l’autre rive',
    intro: 'Au large, une petite île rougeoie certaines nuits. Les pêcheurs jurent qu’une arche de pierre noire s’y dresse… Une galère pourrait y mener quelques braves.',
    choices: [
      {
        label: 'Traverser à la rame et réveiller l’arche', text: 'La galère file droit vers l’île et son arche.',
        dest: 'river', sea: true, scene: 'portal', fail: 'storm', doing: 'explore l’île et réveille le portail', danger: ['water', 'weather'], party: 4, work: 30, risk: 0.25, carry: 'sacks',
        win: [{ t: 'perk', id: 'portal' }, joy(2, 4)], lose: [hurt(1, 2)],
        winText: 'Les braseros flambent, les runes s’allument, et entre les pierres de l’arche un tourbillon rouge et violet s’est mis à tourner : le portail est ouvert ! Sur l’île, on peut maintenant bâtir des tours de garde, puis une caserne.',
        loseText: 'Une tempête s’est levée sur le bras de mer : la galère a dû rebrousser chemin, et un rameur s’est blessé. Il faudra retenter la traversée.',
      },
      {
        label: 'Attendre une mer d’huile', text: 'Plus long, plus sûr : on guette le calme plat.',
        dest: 'river', sea: true, scene: 'portal', fail: 'fog', doing: 'déchiffre les runes de l’arche et réveille le portail', danger: ['water'], party: 3, work: 44, risk: 0.12, carry: 'sacks',
        win: [{ t: 'perk', id: 'portal' }, joy(1, 4)], lose: [],
        winText: 'Par une mer d’huile, l’équipe a gagné l’île et déchiffré les runes une à une : l’arche s’est éveillée dans un grondement, un tourbillon rouge et violet entre ses pierres. Le portail est ouvert ! On peut y bâtir des tours de garde, puis une caserne.',
        loseText: 'La brume est tombée sur le bras de mer : impossible de trouver l’île. La galère est rentrée au port, bredouille.',
      },
    ],
  },
  {
    // expédition légendaire facultative : le mégalodon, en haute mer, contre deux galères
    id: 'megalodon', age: 1, mandatory: false, icon: '🦈', title: 'Chasser le mégalodon',
    intro: 'Un requin gros comme une maison coule les barques des pêcheurs. Deux galères d’hommes d’armes partent le chasser, harpons en main.',
    choices: [
      {
        label: 'Le harponner au large', text: 'Les deux galères l’encadrent et le criblent de harpons.',
        dest: 'river', sea: true, scene: 'megalodon', fail: 'capsize', doing: 'harponne le mégalodon depuis ses deux galères', danger: ['monster', 'water'], party: 5, work: 34, risk: 0.45, carry: 'sacks',
        win: [food(5, 5), joy(3, 5), joy(1), { t: 'ore', n: 6 }, { t: 'perk', id: 'megalodon' }], lose: [hurt(2, 3), joy(-2, 3)],
        winText: 'Les harpons ont frappé juste : le mégalodon est vaincu ! Sa viande nourrit le village, et ses dents géantes ornent la place.',
        loseText: 'Un coup de queue, et une galère a chaviré : les hommes d’armes rentrent à la nage, deux sont blessés.',
      },
      {
        label: 'L’appâter avec une carcasse', text: 'Une carcasse en appât entre les galères. Plus long, plus sûr.',
        dest: 'river', sea: true, scene: 'megalodon', fail: 'capsize', doing: 'attire le mégalodon vers l’appât, harpons levés', danger: ['monster', 'water'], party: 5, work: 40, risk: 0.35, carry: 'sacks',
        win: [food(4, 5), joy(3, 5), joy(1), { t: 'ore', n: 5 }, { t: 'perk', id: 'megalodon' }], lose: [hurt(1, 3), joy(-1, 3)],
        winText: 'Le mégalodon a mordu à l’appât, et les harpons ont fait le reste : ses dents géantes ornent la place.',
        loseText: 'Le mégalodon a emporté l’appât d’un coup de mâchoire et filé vers le large. Un rameur est blessé.',
      },
    ],
  },
  {
    // facultative : la première des expéditions du volcan, sur son île (on y traverse en barque, voir `Expeditions.volcanoTrip`)
    id: 'obsidian', age: 1, mandatory: false, icon: '🌋', title: 'La pierre noire du volcan',
    intro: 'Au pied du volcan, les coulées froides ont laissé une pierre noire, plus tranchante que le silex. Les artisans en voudraient pour leurs outils.',
    choices: [
      {
        label: 'Ramasser au pied des coulées', text: 'Prudent : on ramasse les éclats froids, loin du cratère.',
        dest: 'river', sea: true, scene: 'obsidian', fail: 'rocks', doing: 'ramasse les éclats d’obsidienne au pied des coulées', danger: ['water', 'fall'], party: 3, work: 26, risk: 0.12, carry: 'sacks',
        win: [{ t: 'ore', n: 4 }, jobs(2, 6), joy(1), { t: 'perk', id: 'obsidian' }], lose: [],
        winText: 'Les sacs sont pleins d’éclats noirs et brillants. Les artisans en font des lames et des miroirs.',
        loseText: 'Des pierres ont dévalé la pente : l’équipe a dû repartir les sacs vides.',
      },
      {
        label: 'Tailler la coulée encore tiède', text: 'Audacieux : la plus belle pierre, tout près de la lave.',
        dest: 'river', sea: true, scene: 'obsidian', variant: 'hot', fail: 'rocks', doing: 'taille l’obsidienne dans une coulée encore tiède', danger: ['water', 'fall', 'weather'], party: 4, work: 20, risk: 0.3, carry: 'sacks',
        win: [{ t: 'ore', n: 8 }, jobs(3, 6), joy(1), { t: 'perk', id: 'obsidian' }], lose: [hurt(1, 3)],
        winText: 'De grands blocs d’obsidienne, taillés au bord de la coulée : on n’en a jamais vu d’aussi purs.',
        loseText: 'La croûte a cédé sous un pied : un tailleur s’est brûlé, et l’équipe est rentrée.',
      },
    ],
  },
  // ---------------- Moyen Âge ----------------
  {
    // réussie, elle rapporte de quoi passer à l'âge industriel (12 minerai, voir AGES), quel que soit le choix
    id: 'mine', age: 2, mandatory: true, icon: '⚒️', title: 'Le filon de la montagne', unlocks: 'mine',
    intro: 'Les forgerons manquent de fer. Au cœur de la montagne, dit-on, un filon brille dans le noir.',
    choices: [
      {
        label: 'Creuser une galerie', text: 'Du travail de mineur, long et solide.',
        dest: 'mountain', scene: 'gallery', fail: 'rocks', doing: 'creuse la galerie et sort le minerai au wagonnet', party: 4, work: 30, risk: 0.2, carry: 'cart',
        win: [{ t: 'ore', n: 12 }, jobs(2)], lose: [{ t: 'ore', n: 3 }, hurt(1, 2)],
        winText: 'La galerie a percé le filon : le chariot rentre chargé de minerai, les forges vont chanter.',
        loseText: 'Un éboulement a bloqué la galerie. Un mineur blessé, et seulement quelques pierres de minerai.',
      },
      {
        label: 'Explorer la grande grotte', text: 'On raconte qu’elle cache un trésor… et qu’on s’y perd.',
        dest: 'cave', scene: 'cave', fail: 'dark', doing: 'explore la grotte à la lueur des torches', party: 3, work: 20, risk: 0.35, carry: 'cart',
        win: [{ t: 'ore', n: 16 }, joy(2)], lose: [hurt(2, 2)],
        winText: 'Au fond de la grotte, un filon gros comme un tonneau ! Le village fête ses explorateurs.',
        loseText: 'Les torches se sont éteintes dans la grotte. Deux explorateurs se sont blessés en ressortant.',
      },
      {
        label: 'Acheter du minerai aux mineurs nomades', text: 'Sans danger, mais ils voudront beaucoup de vivres.',
        dest: 'far', scene: 'trade', doing: 'échange des vivres contre le minerai des nomades', party: 2, work: 12, risk: 0.05, carry: 'cart',
        win: [{ t: 'ore', n: 12 }, food(-3, 4)], lose: [],
        winText: 'Les nomades ont échangé leur minerai contre des vivres : il faudra se serrer un peu la ceinture.',
        loseText: 'Les nomades n’ont rien voulu échanger : leur minerai partira ailleurs.',
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
        win: [joy(3), { t: 'perk', id: 'hounds' }], lose: [hurt(1, 2)],
        winText: 'Le loup est parti loin dans la montagne : les bergers dorment enfin.',
        loseText: 'Le loup s’est défendu : un chasseur mordu, et le loup toujours là.',
      },
      {
        label: 'Bâtir des enclos de pierre sèche', text: 'Pas de chasse : on protège les bêtes.',
        dest: 'plain', scene: 'build', doing: 'monte des murets de pierre sèche', party: 2, work: 24, risk: 0.05, carry: 'cart',
        win: [joy(2), food(1), { t: 'perk', id: 'hounds' }], lose: [],
        winText: 'De beaux enclos de pierre : le loup peut toujours rôder.',
        loseText: 'Les pierres manquaient : les enclos attendront.',
      },
    ],
  },
  {
    id: 'fair', age: 2, mandatory: false, icon: '🎪', title: 'Les jongleurs du carrefour', unlocks: 'circus',
    intro: 'Une troupe de jongleurs et de musiciens passe dans la région. Il faudrait aller les chercher au grand carrefour.',
    choices: [
      {
        label: 'Aller à leur rencontre', text: 'Une belle balade, avec un peu de chance au bout.',
        dest: 'far', scene: 'troupe', fail: 'gone', doing: 'applaudit les jongleurs et les invite au village', danger: ['weather'], party: 2, work: 10, risk: 0.15, carry: 'guests',
        win: [joy(5, 5)], lose: [],
        winText: 'La troupe s’installe au village : le cirque peut ouvrir !',
        loseText: 'Les jongleurs avaient promis d’aller jouer ailleurs : ils sont repartis sur la route.',
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
        loseText: 'Le frère n’a rien voulu dire de son secret : la taverne attendra.',
      },
      {
        label: 'Cueillir le houblon sauvage au bord de l’eau', text: 'On rapporte le houblon d’abord. Le frère viendra goûter.',
        dest: 'river', scene: 'hops', doing: 'cueille le houblon sauvage', party: 3, work: 18, risk: 0.2, carry: 'sacks',
        win: [joy(1), food(1)], lose: [hurt(1, 1)],
        winText: 'Des sacs de houblon embaumé : le frère est venu en personne, et la taverne a ouvert le soir même.',
        loseText: 'Une glissade dans les orties : un cueilleur blessé, le houblon perdu.',
      },
    ],
  },
  {
    // facultative (le passage d'âge ne tient qu'au filon) : un gros risque, un gros butin ; les armures et les épées aident
    id: 'dragon', age: 2, mandatory: true, icon: '🐉', title: 'Chasser le dragon',
    intro: 'Un dragon s’est terré dans une grotte : il enlève les moutons et roussit les toits. On dit qu’il dort sur un tas d’or… Des chevaliers sont prêts à l’en déloger.',
    choices: [
      {
        label: 'L’affronter dans sa grotte', text: 'On le défie à l’entrée de son antre. Court et dangereux.',
        dest: 'cave', scene: 'dragon', doing: 'affronte le dragon à l’entrée de sa grotte', danger: ['monster', 'dark'], party: 5, work: 32, risk: 0.45, carry: 'cart',
        win: [{ t: 'ore', n: 16 }, joy(4, 6), joy(2), { t: 'perk', id: 'dragon' }], lose: [hurt(2, 3), joy(-2, 3)],
        winText: 'Le dragon s’est effondré devant sa grotte ! Les chevaliers rentrent avec son trésor : de l’or et du fer plein le chariot.',
        loseText: 'Le dragon a craché le feu et pris son envol : deux chevaliers brûlés, et la bête rôde toujours.',
      },
      {
        label: 'L’enfumer hors de sa grotte', text: 'Un grand feu devant l’entrée l’affaiblit. Plus long, plus sûr.',
        dest: 'cave', scene: 'dragon', variant: 'smoke', doing: 'enfume la grotte du dragon et l’attend, arbalètes braquées', danger: ['monster', 'dark'], party: 4, work: 40, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }, joy(3, 6), joy(2), { t: 'perk', id: 'dragon' }], lose: [hurt(1, 2), joy(-1, 3)],
        winText: 'Le dragon est sorti en toussant, et les carreaux d’arbalète ont fait le reste ! Son trésor rentre au village sur le chariot.',
        loseText: 'Le dragon a jailli de la fumée et s’est envolé par-dessus la montagne : un chevalier brûlé.',
      },
    ],
  },
  {
    // chasse légendaire facultative : le cerf blanc de la forêt ; ses bois rejoignent la place du village (trophée, cinématique)
    id: 'stag', age: 2, mandatory: false, icon: '🦌', title: 'La chasse au cerf blanc',
    intro: 'Un cerf tout blanc, aux bois immenses, hante la forêt. On dit qu’il porte chance au village qui le prend. Le cor sonne.',
    choices: [
      {
        label: 'Le courre avec la meute', text: 'Audacieux : les chiens le lèvent, on le poursuit.',
        dest: 'forest', scene: 'stag', doing: 'court le cerf blanc avec la meute', danger: ['beast'], party: 4, work: 30, risk: 0.38, carry: 'cart',
        win: [food(3, 5), joy(4, 6), joy(2), { t: 'perk', id: 'stag' }], lose: [hurt(1, 2), joy(-1, 3)],
        winText: 'Les chiens l’ont acculé au fond de la clairière : le cerf blanc est pris ! Ses bois immenses orneront la place.',
        loseText: 'Le cerf blanc a sauté le ruisseau et disparu dans la brume. Un chasseur s’est foulé la cheville.',
      },
      {
        label: 'L’attendre à l’affût', text: 'Prudent : on le guette sans bruit, l’arc bandé.',
        dest: 'forest', scene: 'stag', variant: 'stalk', doing: 'guette le cerf blanc à l’affût, l’arc bandé', danger: ['beast', 'weather'], party: 3, work: 40, risk: 0.24, carry: 'cart',
        win: [food(2, 5), joy(3, 6), joy(2), { t: 'perk', id: 'stag' }], lose: [],
        winText: 'Au petit matin, le cerf blanc est venu brouter devant l’affût : une flèche, une seule. Ses bois rejoignent la place.',
        loseText: 'Le cerf blanc a flairé l’affût et s’est éloigné sans hâte. On l’a vu, au moins.',
      },
    ],
  },
  {
    // obligatoire (le volet maritime du Moyen Âge) : la caravelle ouvre le chantier naval, d'où sortiront les navires du village
    id: 'caravel', age: 2, mandatory: true, icon: '⛵', title: 'La caravelle', unlocks: 'shipyard',
    intro: 'Les charpentiers ont dessiné une caravelle, faite pour la haute mer. Avant son chantier, il faut l’essayer et tracer une première route.',
    choices: [
      {
        label: 'Longer la côte à la voile', text: 'Prudent : on garde la terre en vue, longue-vue et cartes en main.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'longe la côte à la voile, la longue-vue à la main', danger: ['water', 'weather'], party: 3, work: 24, risk: 0.25, carry: 'sacks',
        win: [{ t: 'perk', id: 'caravel' }, joy(2, 5), food(2, 5)], lose: [hurt(1, 2)],
        winText: 'La caravelle a tenu la mer : la côte est cartographiée, les marins sont fiers. Les charpentiers réclament leur chantier naval.',
        loseText: 'Un grain a couché les voiles et brisé une vergue. Un marin s’est blessé. La caravelle est rentrée à la rame.',
      },
      {
        label: 'Prendre le large, cap à l’ouest', text: 'Audacieux : trois jours hors de vue de la terre.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'file droit vers l’ouest, loin de toute terre', danger: ['water', 'weather'], party: 4, work: 34, risk: 0.4, carry: 'sacks',
        win: [{ t: 'perk', id: 'caravel' }, joy(3, 6), jobs(2), { t: 'ore', n: 6 }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Cap à l’ouest, la caravelle a trouvé des eaux riches et des routes nouvelles. Le village veut son chantier naval pour en bâtir d’autres !',
        loseText: 'La tempête a repoussé la caravelle : deux marins blessés, mais le navire a tenu.',
      },
    ],
  },
  {
    // facultative : il faut le chantier naval (ouvert par la caravelle) pour armer le navire marchand
    id: 'spice', age: 2, mandatory: false, icon: '🌶️', title: 'La route des épices',
    requires: { kinds: ['shipyard'] },
    intro: 'Le but : rapporter des épices au village. Un navire marchand troque laine et fer contre poivre, safran et soieries, puis revient. Route courte et sûre, ou longue et risquée mais plus riche.',
    choices: [
      {
        label: 'Charger le poivre aux comptoirs proches', text: 'Traversée courte : laine et fer contre des sacs d’épices.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'fog', doing: 'troque laine et fer contre des sacs d’épices', danger: ['water'], party: 3, work: 22, risk: 0.2, carry: 'sacks',
        win: [food(3, 8), joy(2, 6), jobs(1), { t: 'perk', id: 'spices' }], lose: [hurt(1, 1)],
        winText: 'Des sacs de poivre et de cannelle plein la cale : les tables du village sentent bon, et les marchands sont ravis.',
        loseText: 'Pris dans la brume, le navire a perdu sa route et il est rentré à vide.',
      },
      {
        label: 'Pousser jusqu’aux îles aux épices', text: 'Longue route, pirates peut-être, mais soies et safran.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'pousse jusqu’aux îles aux épices et charge la cale', danger: ['water', 'weather'], party: 4, work: 36, risk: 0.4, carry: 'sacks',
        win: [food(5, 8), joy(4, 8), jobs(2), { t: 'ore', n: 10 }, { t: 'perk', id: 'spices' }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Les îles aux épices ! La cale déborde de soies et de safran : le marché du village n’a jamais été aussi animé.',
        loseText: 'Des pirates ont donné la chasse au navire : deux marins blessés, la cargaison jetée à la mer.',
      },
    ],
  },
  // le dénouement de l'archipel (au Médiéval, une fois l'allié choisi et installé chez lui) : la paix en deux pourparlers
  // à 30 % d'échec chacun, moins la bonne volonté gagnée sur les îles (les émissaires, puis l'ambassade, suivie de la cinématique de la paix) ; la guerre, une expédition
  // militaire qui débarque les troupes pour la bataille
  {
    id: 'envoys', age: 2, mandatory: false, talks: true, icon: '📜', title: 'Les émissaires',
    intro: 'Pour faire la paix, il faut d’abord parler. Nos émissaires vont porter des paroles de paix chez notre allié, puis chez son rival.',
    choices: [
      {
        label: 'Passer d’abord chez notre allié', text: 'On rassure l’allié, puis on traverse chez le rival.',
        dest: 'river', sea: true, scene: 'voyage', variant: 'ally', doing: 'porte des paroles de paix d’une île à l’autre', party: 3, work: 30, risk: 0, carry: 'sacks',
        win: [{ t: 'diplo', act: 'post' }, joy(1, 4)], lose: [],
        winText: 'Notre allié a donné sa bénédiction, et son rival a écouté. En gage, il ouvre à nos marchands un comptoir sur son île. Reste à réunir les deux chefs.',
        loseText: 'Les émissaires sont rentrés sans réponse.',
      },
      {
        label: 'Aller droit chez le rival', text: 'Plus court : on parle tout de suite à celui qui se méfie.',
        dest: 'river', sea: true, scene: 'voyage', doing: 'va droit chez le rival, paroles de paix en main', party: 3, work: 22, risk: 0, carry: 'sacks',
        win: [{ t: 'diplo', act: 'post' }, jobs(1, 4)], lose: [],
        winText: 'Surpris de nous voir arriver seuls, les chefs du rival ont écouté jusqu’au bout. En gage, ils ouvrent à nos marchands un comptoir sur leur île. Reste à réunir les deux chefs.',
        loseText: 'Les émissaires sont rentrés sans réponse.',
      },
    ],
  },
  {
    id: 'truce', age: 2, mandatory: false, talks: true, icon: '🕊️', title: 'L’ambassade de la paix', unlocks: 'concord',
    requires: { missions: ['envoys'] },
    intro: 'Nos ambassadeurs vont réunir les chefs des deux îles autour d’une même table. S’ils signent une trêve, les combats cessent, et les trois peuples feront la fête.',
    choices: [
      {
        label: 'Réunir les chefs sur une petite île', text: 'Terrain neutre : une tente, une table et trois chaises.',
        dest: 'river', sea: true, scene: 'voyage', variant: 'islet', doing: 'réunit les chefs des deux îles sous une tente', party: 4, work: 40, risk: 0, carry: 'guests',
        win: [{ t: 'diplo', act: 'truce' }, { t: 'diplo', act: 'feast' }, joy(3), food(3, 6)], lose: [],
        winText: 'Sous la tente, les deux chefs ont signé une trêve, et notre village en est le témoin. Les invités des deux îles viennent la fêter chez nous. Pour s’en souvenir : un monument de la concorde et une ambassade à bâtir.',
        loseText: 'Les chefs ne sont pas venus.',
      },
      {
        label: 'Signer à bord de notre navire', text: 'Au milieu du bras de mer, sous notre pavillon.',
        dest: 'river', sea: true, scene: 'voyage', variant: 'ship', doing: 'accueille les chefs des deux îles à son bord', party: 4, work: 32, risk: 0, carry: 'guests',
        win: [{ t: 'diplo', act: 'truce' }, { t: 'diplo', act: 'feast' }, joy(4), jobs(1, 6)], lose: [],
        winText: 'À notre bord, au milieu du bras de mer, les deux chefs ont signé une trêve. Les invités des deux îles viennent la fêter chez nous. Pour s’en souvenir : un monument de la concorde et une ambassade à bâtir.',
        loseText: 'Les chefs ne sont pas venus.',
      },
    ],
  },
  {
    // la candidature des Jeux des îles (chantier D, au Moderne, voie de la paix) : un pourparler à trois peuples, qui peut échouer
    id: 'gamesBid', age: 4, mandatory: false, talks: true, icon: '🏟️', title: 'La candidature des Jeux',
    intro: 'Les trois peuples pourraient fêter leur paix par de grands Jeux, chez notre allié. Encore faut-il que les deux chefs acceptent de concourir côte à côte.',
    choices: [
      {
        label: 'Réunir les trois chefs sur une petite île', text: 'Terrain neutre : la tente blanche, la table ronde, trois chaises.',
        dest: 'river', sea: true, scene: 'voyage', variant: 'islet', doing: 'défend la candidature des Jeux devant les deux chefs', party: 4, work: 38, risk: 0, carry: 'guests',
        win: [{ t: 'diplo', act: 'bid' }, joy(2, 4)], lose: [],
        winText: 'Les deux chefs ont dit oui : les Jeux des îles se tiendront dans notre concession. Il faut bâtir le site des Jeux et livrer son chantier.',
        loseText: 'Les chefs n’ont pas voulu concourir côte à côte. La candidature pourra être présentée de nouveau.',
      },
      {
        label: 'Les recevoir à bord de notre navire', text: 'Au milieu du bras de mer, sous les trois pavillons.',
        dest: 'river', sea: true, scene: 'voyage', variant: 'ship', doing: 'reçoit les deux chefs à bord pour la candidature des Jeux', party: 4, work: 30, risk: 0, carry: 'guests',
        win: [{ t: 'diplo', act: 'bid' }, jobs(1, 4)], lose: [],
        winText: 'Sous les trois pavillons, les deux chefs ont dit oui : les Jeux des îles se tiendront dans notre concession. Il faut bâtir le site des Jeux et livrer son chantier.',
        loseText: 'Les chefs n’ont pas voulu concourir côte à côte. La candidature pourra être présentée de nouveau.',
      },
    ],
  },
  {
    // (l'id `allywar` reste celui de l'ancienne expédition « Aux côtés de notre allié » : les sauvegardes et le diorama le lisent)
    id: 'allywar', age: 2, mandatory: false, icon: '🔭', title: 'Envoyer des éclaireurs',
    intro: 'Avant la bataille, il faut connaître la côte rivale. Ses défenses, la plage où débarquer, combien de soldats la gardent : une barque d’éclaireurs part de nuit, la longue-vue à la main.',
    choices: [
      {
        label: 'Sonder la plage de nuit', text: 'Prudent : on accoste de nuit sur la plage rivale pour repérer où débarquer.',
        dest: 'river', sea: true, scene: 'scout', oneWay: true, troop: 'cavalry', fail: 'fog', doing: 'traverse jusqu’à l’île rivale, débarque et observe ses défenses', danger: ['water'], party: 3, work: 80, risk: 0.15, carry: 'sacks',
        win: [{ t: 'diplo', act: 'landing' }, { t: 'diplo', act: 'scoutBeach' }], lose: [hurt(1, 2)],
        winText: 'Les éclaireurs ont trouvé une plage en pente douce, mal gardée, à l’écart du port : nos troupes y débarqueront. La bataille peut commencer.',
        loseText: 'La brume est tombée sur la côte rivale : les éclaireurs n’ont rien vu, un rameur blessé. Il faudra retenter.',
      },
      {
        label: 'Compter la garnison', text: 'Audacieux : les éclaireurs se glissent jusqu’aux remparts rivaux.',
        dest: 'river', sea: true, scene: 'scout', oneWay: true, troop: 'cavalry', fail: 'storm', doing: 'traverse jusqu’à l’île rivale et se glisse vers les remparts pour compter la garnison', danger: ['water', 'weather'], party: 3, work: 70, risk: 0.3, carry: 'sacks',
        win: [{ t: 'diplo', act: 'landing' }, { t: 'diplo', act: 'scoutGarrison' }], lose: [hurt(1, 3), joy(-1, 3)],
        winText: 'Les éclaireurs ont compté les soldats du port et des remparts, et noté l’heure de la relève : leurs renforts arriveront tard. La bataille peut commencer.',
        loseText: 'Une sentinelle a donné l’alarme : les éclaireurs ont dû fuir sous les flèches, un blessé. Il faudra retenter.',
      },
    ],
  },
  {
    // facultative : on monte au cratère du volcan (sur son île)
    id: 'ascent', age: 2, mandatory: false, icon: '🔥', title: 'Monter au cratère',
    intro: 'Au sommet du volcan, dit-on, un lac de feu bouillonne. Les alchimistes paieraient cher pour son soufre jaune. Qui osera monter jusqu’au bord ?',
    choices: [
      {
        label: 'Par la crête, encordés', text: 'Prudent : on suit la crête, encordés deux par deux.',
        dest: 'river', sea: true, scene: 'ascent', fail: 'rocks', doing: 'monte au cratère par la crête, encordée', danger: ['water', 'fall'], party: 3, work: 34, risk: 0.16, carry: 'sacks',
        win: [{ t: 'ore', n: 6 }, joy(2, 6), joy(1), { t: 'perk', id: 'sulfur' }], lose: [hurt(1, 2)],
        winText: 'L’équipe a vu le lac de feu de ses yeux, et rapporte du soufre plein les sacs. Le village ne parle que de ça.',
        loseText: 'Un pan de la crête s’est effondré : un grimpeur blessé, et l’équipe a fait demi-tour sous le sommet.',
      },
      {
        label: 'Descendre au bord du lac de lave', text: 'Audacieux : jusqu’au bord du feu, pour le plus beau soufre.',
        dest: 'river', sea: true, scene: 'ascent', variant: 'lava', fail: 'rocks', doing: 'descend dans le cratère jusqu’au bord du lac de lave', danger: ['water', 'fall', 'weather'], party: 4, work: 26, risk: 0.35, carry: 'sacks',
        win: [{ t: 'ore', n: 10 }, joy(3, 6), joy(1), { t: 'perk', id: 'sulfur' }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Au bord même du lac de lave, l’équipe a gratté le soufre le plus pur. Les alchimistes n’en reviennent pas.',
        loseText: 'Une bouffée brûlante est montée du lac : deux blessés, et l’équipe est redescendue en toussant.',
      },
    ],
  },
  // les expéditions facultatives sur les îles des deux peuples (voir `isleMissions.ts`)
  ...ISLE_MISSIONS,
  // ---------------- Âge industriel ----------------
  {
    id: 'railway', age: 3, mandatory: true, icon: '🚂', title: 'Le tracé du chemin de fer',
    intro: 'Le chemin de fer arrive dans la région. Des géomètres doivent repérer le meilleur tracé jusqu’au village.',
    choices: [
      {
        label: 'Par la plaine, en contournant tout', text: 'Le plus long, le plus sûr.',
        dest: 'plain', scene: 'rails', danger: ['weather'], doing: 'pose la voie ferrée à travers la plaine', party: 3, work: 26, risk: 0.1,
        win: [jobs(4), joy(1), { t: 'perk', id: 'railfast' }], lose: [],
        winText: 'Le tracé le plus long, mais le plus sûr : les ouvriers arrivent en nombre.',
        loseText: 'Les relevés étaient faux : il faudra recommencer.',
      },
      {
        label: 'Percer un tunnel sous la montagne', text: 'Audacieux, et les déblais pourraient rapporter.',
        dest: 'mountain', scene: 'gallery', fail: 'rocks', doing: 'perce le tunnel et sort les déblais', party: 4, work: 30, risk: 0.35, carry: 'cart',
        win: [jobs(5), { t: 'ore', n: 8 }, { t: 'perk', id: 'railfast' }], lose: [hurt(2, 3)],
        winText: 'Le tunnel est percé ! En prime, les déblais regorgent de charbon et de fer.',
        loseText: 'Un éboulement dans le tunnel : deux ouvriers blessés.',
      },
      {
        label: 'Jeter un pont sur la rivière', text: 'Un ouvrage d’art qu’on viendra voir de loin.',
        dest: 'river', scene: 'bridge', doing: 'jette le pont sur la rivière', danger: ['water', 'fall'], party: 3, work: 22, risk: 0.2,
        win: [jobs(4), joy(2), { t: 'perk', id: 'railfast' }], lose: [hurt(1, 2)],
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
        win: [{ t: 'ore', n: 8 }, { t: 'perk', id: 'coalfire' }], lose: [],
        winText: 'Une belle veine : les wagonnets rentrent pleins.',
        loseText: 'Rien que de la roche stérile.',
      },
      {
        label: 'Descendre dans la grotte', text: 'Plus riche, plus dangereux.',
        dest: 'cave', scene: 'cave', fail: 'blast', doing: 'descend dans la grotte, lampe au front', party: 3, work: 18, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }, { t: 'perk', id: 'coalfire' }], lose: [hurt(1, 2)],
        winText: 'La grotte cachait une veine énorme !',
        loseText: 'Un coup de grisou : un prospecteur blessé.',
      },
    ],
  },
  {
    id: 'motorcar', age: 3, mandatory: true, icon: '🚗', title: 'La course automobile', unlocks: 'carworks',
    intro: 'Un ingénieur de passage a monté une drôle de voiture sans chevaux. Il cherche une équipe pour la mener à la grande course de la région.',
    choices: [
      {
        label: 'Rouler prudemment jusqu’à l’arrivée', text: 'Finir la course, c’est déjà la gagner.',
        dest: 'plain', scene: 'race', danger: ['weather'], doing: 'prépare la voiture et file sur la route de la course', party: 3, work: 22, risk: 0.15,
        win: [jobs(3), joy(1)], lose: [],
        winText: 'La voiture franchit la ligne sous les vivats : l’ingénieur ouvre une usine au village, et les premières automobiles remplacent les charrettes.',
        loseText: 'Une roue cassée dans le fossé : la voiture rentre en remorque.',
      },
      {
        label: 'Pousser la machine à fond', text: 'La victoire, ou le fossé.',
        dest: 'plain', scene: 'race', danger: ['weather'], doing: 'pousse la voiture à fond sur la route de la course', party: 3, work: 18, risk: 0.35,
        win: [jobs(4), joy(3)], lose: [hurt(1, 2)],
        winText: 'Première sur la ligne ! Toute la région parle de la voiture du village : une usine automobile s’y installe, et les charrettes cèdent la route aux autos.',
        loseText: 'Un tête-à-queue dans le virage : le pilote est blessé.',
      },
    ],
  },
  {
    id: 'flight', age: 3, mandatory: false, icon: '🎈', title: 'Le premier envol', unlocks: 'aerodrome',
    intro: 'Des aéronautes veulent faire voler un ballon au-dessus de la région. Il leur faut des bras pour tenir les cordes, et du cran pour monter dans la nacelle.',
    choices: [
      {
        label: 'Gonfler la montgolfière dans la plaine', text: 'Par temps calme, au ras des champs.',
        dest: 'plain', scene: 'balloon', danger: ['weather'], doing: 'gonfle la montgolfière et tient les cordes', party: 4, work: 20, risk: 0.15,
        win: [joy(2)], lose: [hurt(1, 1)],
        winText: 'Le ballon s’élève au-dessus du village sous les applaudissements : un aérodrome s’ouvre, montgolfières et dirigeable y viendront.',
        loseText: 'Un coup de vent a couché le ballon : une main brûlée au brûleur.',
      },
      {
        label: 'Décoller du col, dans les vents de la montagne', text: 'Plus haut, plus loin, plus risqué.',
        dest: 'mountain', scene: 'balloon', doing: 'gonfle la montgolfière au col et guette le vent', party: 3, work: 24, risk: 0.3,
        win: [joy(3), { t: 'ore', n: 3 }], lose: [hurt(1, 2)],
        winText: 'Le ballon a survolé toute la région, et de là-haut on a repéré un filon. L’aérodrome ouvre ses portes.',
        loseText: 'Atterrissage dans les rochers : un aéronaute blessé.',
      },
    ],
  },
  {
    // une courte expédition qui ouvre la raffinerie : sans elle, pas de carburant, et sans carburant, pas de voitures
    id: 'oil', age: 3, mandatory: true, icon: '🛢️', title: 'L’or noir', unlocks: 'refinery',
    intro: 'Un prospecteur a vu un liquide noir suinter du sol. S’il y a là du pétrole, un ingénieur viendra bâtir une raffinerie au village : on en tirera le carburant des futures automobiles.',
    choices: [
      {
        label: 'Forer un puits d’essai tout près', text: 'Court et sans danger.',
        dest: 'plain', scene: 'drill', danger: ['weather'], doing: 'fore un puits d’essai là où le brut suinte', party: 2, work: 12, risk: 0.1, carry: 'cart',
        win: [jobs(2)], lose: [],
        winText: 'Le pétrole jaillit du puits d’essai ! L’ingénieur promet sa raffinerie : bâtissez-la, avec des puits de pétrole sur les taches sombres.',
        loseText: 'Rien que de l’eau boueuse : il faudra forer ailleurs.',
      },
      {
        label: 'Suivre les suintements au-delà des collines', text: 'Plus loin, un gisement plus riche.',
        dest: 'far', scene: 'drill', danger: ['weather'], doing: 'suit les suintements et fore au cœur du gisement', party: 3, work: 16, risk: 0.2, carry: 'cart',
        win: [jobs(3), joy(1)], lose: [hurt(1, 1)],
        winText: 'Un geyser de pétrole au-delà des collines ! Toute la région en parle, et l’ingénieur promet sa raffinerie au village.',
        loseText: 'Le trépan s’est brisé : un foreur blessé à la main.',
      },
    ],
  },
  {
    // facultative : une épave à draguer, il faut le chantier naval pour armer le bateau de relevage
    id: 'galleon', age: 3, mandatory: false, icon: '💰', title: 'Le galion englouti',
    requires: { kinds: ['shipyard'] },
    intro: 'Les vieux pêcheurs parlent d’un galion englouti au large avec sa cargaison d’or. Un bateau à vapeur et des scaphandriers pourraient le retrouver.',
    choices: [
      {
        label: 'Draguer le fond au large', text: 'La drague racle le fond : lent, sans plongeur à risquer.',
        dest: 'river', sea: true, scene: 'wreck', fail: 'storm', doing: 'drague le fond à la recherche du galion', danger: ['water', 'weather'], party: 3, work: 26, risk: 0.2, carry: 'sacks',
        win: [{ t: 'ore', n: 10 }, joy(2, 6), { t: 'perk', id: 'galleon' }], lose: [hurt(1, 1)],
        winText: 'La drague a ramené des bordages noircis, des canons et quelques lingots : le galion repose bien là.',
        loseText: 'La chaîne de la drague s’est rompue dans une houle : rien remonté, un matelot blessé.',
      },
      {
        label: 'Envoyer le scaphandrier', text: 'Casque de cuivre, pompe à bras : il descend jusqu’au pont.',
        dest: 'river', sea: true, scene: 'wreck', variant: 'diver', fail: 'capsize', doing: 'descend le scaphandrier jusqu’au pont du galion', danger: ['water'], party: 4, work: 34, risk: 0.4, carry: 'sacks',
        win: [{ t: 'ore', n: 22 }, joy(4, 6), joy(1), { t: 'perk', id: 'galleon' }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Le scaphandrier a ouvert les coffres du galion : de l’or et de l’argent, remontés à la pompe. Le village en parlera longtemps.',
        loseText: 'Le tuyau d’air s’est emmêlé : le scaphandrier a été remonté de justesse, et deux marins sont blessés.',
      },
    ],
  },
  {
    // facultative : le volcan se réveille au-dessus d'un petit village de son île ; l'équipe traverse pour le sauver
    id: 'eruption', age: 3, mandatory: false, icon: '🌋', title: 'Le village sous le volcan',
    intro: 'Le volcan gronde et crache de la fumée. À son pied, un petit village de pêcheurs n’a pas de bateau pour fuir. Il faut y aller, vite.',
    choices: [
      {
        label: 'Évacuer par la plage', text: 'Prudent : on emmène tout le monde vers le bateau.',
        dest: 'river', sea: true, scene: 'eruption', fail: 'rocks', doing: 'conduit les habitants du village jusqu’au bateau', danger: ['water', 'fall'], party: 4, work: 30, risk: 0.15, carry: 'refugees',
        win: [joy(3, 6), jobs(2), food(2, 6), { t: 'perk', id: 'dikes' }], lose: [hurt(1, 2)],
        winText: 'Tout le village est monté à bord avant que la lave n’arrive. Les pêcheurs s’installent chez nous, et ils ont des bras.',
        loseText: 'La cendre a caché la plage : l’équipe a dû rembarquer sans tout le monde, et un sauveteur s’est blessé.',
      },
      {
        label: 'Détourner la lave par une tranchée', text: 'Audacieux : on creuse pour sauver les maisons.',
        dest: 'river', sea: true, scene: 'eruption', variant: 'trench', fail: 'rocks', doing: 'creuse une tranchée pour détourner la coulée du village', danger: ['water', 'fall', 'weather'], party: 5, work: 36, risk: 0.35, carry: 'refugees',
        win: [joy(4, 6), joy(1), jobs(2), { t: 'ore', n: 6 }, { t: 'perk', id: 'dikes' }], lose: [hurt(2, 3), joy(-2, 4)],
        winText: 'La coulée a suivi la tranchée et filé vers la mer : les maisons sont sauves ! Le village reconnaissant nous offre son fer.',
        loseText: 'La lave a franchi la tranchée : on a sauvé les gens, pas les maisons. Deux sauveteurs sont brûlés.',
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
        win: [joy(4), jobs(2), { t: 'perk', id: 'meteo' }], lose: [hurt(1, 2)],
        winText: 'Drapeau au sommet ! La station envoie déjà ses premières mesures.',
        loseText: 'Le vent a forcé la cordée à redescendre. Un porteur s’est tordu la cheville.',
      },
      {
        label: 'Par la vallée, avec un camp de base', text: 'Lentement mais sûrement.',
        dest: 'far', scene: 'basecamp', fail: 'storm', doing: 'monte le camp de base, puis la station au sommet', danger: ['weather', 'fall'], party: 4, work: 30, risk: 0.1, carry: 'sacks',
        win: [joy(3), jobs(3), { t: 'perk', id: 'meteo' }], lose: [],
        winText: 'La station est installée, et le village a sa photo dans le journal.',
        loseText: 'Le mauvais temps a tout reporté.',
      },
    ],
  },
  {
    id: 'reef', age: 4, mandatory: false, icon: '🐠', title: 'Le récif', unlocks: 'coralpool',
    intro: 'Des plongeurs aimeraient étudier le récif, loin au large. On y va en bateau : baleines, dauphins et raies y nagent, dit-on.',
    choices: [
      {
        label: 'Partir avec les plongeurs', text: 'Masques, tubas et pique-nique, en bateau jusqu’au large.',
        dest: 'river', sea: true, scene: 'dive', doing: 'plonge sur le récif avec les plongeurs, au large', danger: ['water'], party: 2, work: 22, risk: 0.1,
        win: [joy(3)], lose: [],
        winText: 'Des photos magnifiques : des baleines, des dauphins qui sautent, des raies géantes ! Tout le village veut aller voir.',
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
        dest: 'mountain', scene: 'stars', fail: 'rocks', doing: 'observe la pluie d’étoiles filantes', danger: ['fall', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
        win: [joy(3)], lose: [hurt(1, 2)],
        winText: 'Toute la nuit, le ciel a plu des étoiles : les astronomes ont choisi la place de leur observatoire.',
        loseText: 'Un faux pas dans les éboulis : une lunette brisée et un porteur blessé.',
      },
      {
        label: 'Chercher la météorite tombée dans la plaine', text: 'Elle est tombée la nuit dernière, quelque part par là.',
        dest: 'far', scene: 'crater', danger: ['weather'], doing: 'dégage la météorite de son cratère', party: 2, work: 16, risk: 0.15, carry: 'cart',
        win: [joy(2), { t: 'ore', n: 4 }], lose: [],
        winText: 'La météorite fumait encore au fond de son trou : du fer tombé du ciel, et un observatoire promis au village !',
        loseText: 'Rien qu’un rocher ordinaire… la météorite est tombée ailleurs.',
      },
    ],
  },
  {
    // les grands Jeux, au stade du village : il faut toutes les installations sportives ; la flamme, la foule, le podium
    id: 'games', age: 4, mandatory: false, icon: '🏅', title: 'Organiser les JO',
    requires: { kinds: ['stadium', 'football', 'basket', 'tennis', 'waterpark', 'alpine'] },
    intro: 'Le village a tout ce qu’il faut pour accueillir les Jeux. Athlètes du monde entier, relais de la flamme, cérémonie d’ouverture… le monde entier regardera !',
    choices: [
      {
        label: 'Une cérémonie grandiose', text: 'Flamme, défilé des nations, foule en délire : une grande fête.',
        dest: 'plain', scene: 'games', fail: 'storm', doing: 'allume la flamme au stade et ouvre les Jeux devant la foule', danger: ['weather'], party: 6, work: 34, risk: 0.2,
        win: [joy(10, 10), joy(4), jobs(4), { t: 'ore', n: 8 }, { t: 'perk', id: 'games' }], lose: [joy(-2, 4)],
        winText: 'La flamme brille au-dessus du stade, les médailles pleuvent : le monde entier parle du village ! Les visiteurs ont laissé de quoi garnir les réserves.',
        loseText: 'Un orage a noyé la cérémonie : la flamme s’est éteinte, et les Jeux se sont terminés sous les parapluies.',
      },
      {
        label: 'Des Jeux simples et joyeux', text: 'Moins de faste, plus de sport : on court, on saute, on nage.',
        dest: 'plain', scene: 'games', fail: 'storm', doing: 'allume la flamme au stade et lance les épreuves', danger: ['weather'], party: 4, work: 26, risk: 0.08,
        win: [joy(6, 8), joy(2), jobs(2), { t: 'ore', n: 4 }, { t: 'perk', id: 'games' }], lose: [],
        winText: 'Des records, des sourires et des médailles : les Jeux du village resteront dans les mémoires.',
        loseText: 'La pluie a écourté les épreuves : on remettra ça.',
      },
    ],
  },
  {
    // facultative : le chalutier a besoin d'un marché où décharger la pêche
    id: 'trawl', age: 4, mandatory: false, icon: '🎣', title: 'La pêche en haute mer',
    requires: { kinds: ['fishmarket'] },
    intro: 'Le marché réclame plus de poisson. Un chalutier pourrait ratisser les grands fonds, loin au large.',
    choices: [
      {
        label: 'Chaluter sur le plateau', text: 'Pêche régulière, au large mais pas trop loin.',
        dest: 'river', sea: true, scene: 'trawl', fail: 'storm', doing: 'chalute sur le plateau, les filets pleins', danger: ['water', 'weather'], party: 3, work: 22, risk: 0.2, carry: 'sacks',
        win: [food(6, 8), jobs(1), { t: 'perk', id: 'trawlers' }], lose: [hurt(1, 1)],
        winText: 'Les filets sont remontés pleins à craquer : le marché de la mer n’a jamais autant vendu.',
        loseText: 'Le filet s’est pris dans une épave : un marin blessé, la pêche perdue.',
      },
      {
        label: 'Suivre les thons au grand large', text: 'Plus loin, plus long : des bancs de thons géants.',
        dest: 'river', sea: true, scene: 'trawl', fail: 'storm', doing: 'suit les bancs de thons au grand large', danger: ['water', 'weather'], party: 4, work: 32, risk: 0.35, carry: 'sacks',
        win: [food(10, 8), food(1), joy(2, 6), jobs(2), { t: 'perk', id: 'trawlers' }], lose: [hurt(2, 2), joy(-1, 3)],
        winText: 'Des thons par centaines ! La criée a vendu jusqu’au dernier, et le village mange du poisson toute la semaine.',
        loseText: 'Une lame a emporté les filets : deux marins blessés, rien à vendre.',
      },
    ],
  },
  // ---------------- Âge futuriste : la conquête de l'espace ----------------
  {
    // facultative : explorer les îles flottantes, depuis la ferme marine
    id: 'seafarm', age: 5, mandatory: false, icon: '🏝️', title: 'Les îles flottantes',
    requires: { kinds: ['offshore'] },
    intro: 'Au large, des îles de culture dérivent : algues géantes, coraux, bancs rares. L’hydroglisseur du village peut les rejoindre et les ancrer près de la ferme marine.',
    choices: [
      {
        label: 'Ancrer les îles de culture', text: 'On les remorque jusqu’à la ferme marine : lent et sûr.',
        dest: 'river', sea: true, scene: 'isles', fail: 'fog', doing: 'remorque les îles de culture vers la ferme marine', danger: ['water'], party: 3, work: 26, risk: 0.15, carry: 'sacks',
        win: [food(6, 10), jobs(2), joy(2, 6), { t: 'perk', id: 'cropisles' }], lose: [],
        winText: 'Les îles de culture sont ancrées devant la ferme marine : algues et poissons à foison.',
        loseText: 'Le brouillard a dispersé les îles : il faudra les retrouver.',
      },
      {
        label: 'Explorer l’archipel des récifs vivants', text: 'Un archipel de coraux et de bancs rares, loin de toute route.',
        dest: 'river', sea: true, scene: 'isles', fail: 'storm', doing: 'explore l’archipel des récifs vivants', danger: ['water', 'weather'], party: 4, work: 34, risk: 0.3, carry: 'sacks',
        win: [food(8, 10), joy(4, 8), jobs(3), { t: 'ore', n: 12 }, { t: 'perk', id: 'cropisles' }], lose: [hurt(1, 2), joy(-1, 3)],
        winText: 'Un archipel intact, riche en coraux, en perles et en minerais rares : de quoi nourrir et enrichir le village.',
        loseText: 'Une tempête magnétique a brouillé les instruments : le navire est rentré sans rien, un marin blessé.',
      },
    ],
  },
  {
    id: 'rocket', age: 5, mandatory: false, icon: '🚀', title: 'Premier vol de fusée',
    requires: { kinds: ['spaceport'] },
    intro: 'Au cosmodrome, la première fusée du village attend sur le pas de tir. Ingénieurs et habitants retiennent leur souffle : si elle perce le ciel, la route des étoiles s’ouvre.',
    choices: [
      {
        label: 'Un vol d’essai, sans équipage', text: 'Prudent : la fusée emporte un petit satellite et ses instruments.',
        dest: 'spaceport', scene: 'launch', doing: 'compte à rebours, puis suit la fusée qui perce le ciel', danger: ['weather'], party: 3, work: 40, risk: 0.2,
        win: [joy(6), jobs(6), { t: 'perk', id: 'satellites' }], lose: [joy(-3, 3)],
        winText: 'Allumage, décollage… la fusée a disparu dans le bleu du ciel, et le satellite envoie ses premiers bips : tout le village a crié de joie !',
        loseText: 'Un moteur a calé en plein vol : la fusée s’est abîmée en mer. Les ingénieurs ont déjà repris leurs plans.',
      },
      {
        label: 'Pousser les moteurs à fond', text: 'Plus haut, plus vite… et plus risqué.',
        dest: 'spaceport', scene: 'launch', doing: 'pousse les moteurs à fond et suit la fusée jusqu’en orbite', danger: ['weather'], party: 3, work: 32, risk: 0.38,
        win: [joy(8), jobs(8), { t: 'perk', id: 'satellites' }], lose: [joy(-4, 4), hurt(1, 3)],
        winText: 'La fusée a filé droit vers l’orbite, plus haut que personne ne l’espérait : la route des étoiles est ouverte !',
        loseText: 'Trop de poussée : la fusée a explosé au-dessus de la mer, et une pluie de débris a blessé un technicien.',
      },
    ],
  },
  {
    id: 'moon', age: 5, mandatory: false, icon: '🌕', title: 'Un homme sur la Lune',
    requires: { missions: ['rocket'], kinds: ['spaceport'] },
    intro: 'La grande fusée lunaire est prête. Trois astronautes du village tentent le voyage : trois jours jusqu’à la Lune, l’alunissage, les premiers pas… et le retour. Tout le village suivra l’alunissage en direct.',
    choices: [
      {
        label: 'Alunir dans la mer de la Tranquillité', text: 'Une grande plaine lisse : l’endroit le plus sûr.',
        dest: 'spaceport', scene: 'moon', doing: 'lance la fusée lunaire et suit l’alunissage en direct', danger: ['weather'], party: 4, work: 60, risk: 0.2,
        win: [joy(12), jobs(6), { t: 'perk', id: 'moon' }], lose: [joy(-4, 4)],
        winText: '« Un petit pas pour un habitant, un grand bond pour le village ! » Le drapeau flotte sur la Lune, et les astronautes sont rentrés sains et saufs.',
        loseText: 'Une alarme de l’ordinateur de bord : le module a dû renoncer à se poser et rentrer. On retentera.',
      },
      {
        label: 'Se poser au bord des grands cratères', text: 'Le plus beau paysage, et des roches inconnues… sur un sol accidenté.',
        dest: 'spaceport', scene: 'moon', variant: 'craters', doing: 'lance la fusée lunaire et suit l’alunissage au bord des cratères', danger: ['weather'], party: 4, work: 54, risk: 0.35,
        win: [joy(14), jobs(6), { t: 'ore', n: 12 }, { t: 'perk', id: 'moon' }], lose: [joy(-5, 4), hurt(2, 4)],
        winText: 'Le module s’est posé au bord d’un cratère géant : les astronautes rapportent des roches lunaires, du minerai inconnu et des images à couper le souffle.',
        loseText: 'Le module a heurté un rocher : les astronautes ont dû redécoller en catastrophe, et rentrent blessés.',
      },
    ],
  },
  {
    id: 'colony', age: 5, mandatory: false, icon: '🪐', title: 'Coloniser une autre planète', farewell: true,
    requires: { missions: ['moon'], kinds: ['spaceport', 'fusion'] },
    intro: 'Le dernier voyage : un vaisseau colonial emporte des colons vers une planète bleue. Tout le village leur dit adieu, puis les accompagne jusqu’au pas de tir. Là-bas, ils fonderont un nouveau village… autour d’un feu de camp.',
    choices: [
      {
        label: 'L’arche des colons', text: 'Un grand vaisseau, lent et sûr, avec ses serres et ses graines.',
        dest: 'spaceport', scene: 'colony', doing: 'embarque les colons et lance le vaisseau vers l’étoile voisine', danger: ['weather'], party: 5, work: 70, risk: 0,
        win: [joy(20), { t: 'perk', id: 'colony' }], lose: [],
        winText: 'Des années plus tard, un message arrive des étoiles : les colons se sont posés sur la planète bleue et y ont allumé leur premier feu de camp. Le village a essaimé dans le ciel.',
        loseText: 'Une tempête solaire a forcé le vaisseau à faire demi-tour : les colons reviennent, déçus mais sains et saufs. On réparera l’arche.',
      },
      {
        label: 'Le saut à travers l’espace', text: 'Un moteur qui plie l’espace : quelques mois de voyage.',
        dest: 'spaceport', scene: 'colony', variant: 'warp', doing: 'embarque les colons et allume le moteur expérimental', danger: ['weather'], party: 5, work: 56, risk: 0,
        win: [joy(22), { t: 'perk', id: 'colony' }], lose: [],
        winText: 'Un éclair, et le vaisseau a disparu… pour reparaître au bord de l’autre étoile. Les colons se sont posés sur la planète bleue : un nouveau village est né !',
        loseText: 'Le moteur expérimental a lâché au décollage : le vaisseau est retombé en mer, et deux colons sont blessés.',
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
  return effects.filter((e) => e.t !== 'perk' && e.t !== 'diplo' && e.t !== 'boon').map((e) => (e.t === 'need' && !e.days ? { ...e, days: REDO_DAYS } : e));
}

/** Bêtes par enclos, chevaux par écurie, au plus */
export const PEN_CAP = 6;
export const STABLE_CAP = 4;

/**
 * Bêtes de chaque écurie et de chaque enclos (dans l'ordre où ils ont été bâtis) : les chevaux vont d'abord à l'écurie, le
 * reste du troupeau (et les chevaux en trop) dans les enclos ; celles qui, faute de place, paissent près des fermes.
 * `flock` : un autre troupeau que celui du village (celui de tout à l'heure, avec les bêtes qu'une équipe ramène)
 */
export function penHerds(w: World, flock: HerdKind[] = w.exp.herd) {
  const all = (k: KindId) => [...w.buildings.values()].filter((b) => b.kind === k).sort((a, b) => a.id - b.id);
  const horses = flock.filter((k) => k === 'horse').slice(w.exp.riding), stables = new Map<number, HerdKind[]>(), pens = new Map<number, HerdKind[]>();
  let h = 0;
  for (const s of all('stable')) { stables.set(s.id, horses.slice(h, h + STABLE_CAP)); h += STABLE_CAP; }
  const herd = [...flock.filter((k) => k !== 'horse'), ...horses.slice(h)];
  let i = 0;
  for (const p of all('pen')) { pens.set(p.id, herd.slice(i, i + PEN_CAP)); i += PEN_CAP; }
  return { pens, stables, rest: herd.slice(i) };
}

/** Un poulain naît dans une écurie qui a une place libre toutes les `FOAL_S` secondes de jeu (environ deux jours) */
export const FOAL_S = 200;

/**
 * Les écuries (haras, centre équestre) élèvent des chevaux : tant qu'une stalle est libre, un poulain naît toutes les
 * `FOAL_S` secondes de jeu, pour toutes les écuries ensemble, sans couple de départ (demande de l'auteur, 26 nov. 2026 :
 * les cavaliers des Enfers manquaient de chevaux alors que le village avait des haras). Les chevaux montés ou partis
 * en expédition ne prennent pas de stalle. Renvoie le nombre de poulains nés
 */
export function breedHorses(w: World, dt: number): number {
  const e = w.exp;
  let stalls = 0;
  for (const b of w.buildings.values()) if (b.kind === 'stable') stalls += STABLE_CAP;
  const free = stalls - Math.max(0, e.herd.filter((k) => k === 'horse').length - e.riding);
  if (free <= 0 || dt <= 0) { e.foal = 0; return 0; }
  e.foal += dt;
  let n = 0;
  while (e.foal >= FOAL_S && n < free) { e.foal -= FOAL_S; e.herd.push('horse'); n++; }
  if (n >= free) e.foal = 0;
  return n;
}

/** Les missions obligatoires de l'âge : toutes à réussir pour ouvrir l'âge suivant (deux à la Préhistoire) */
/** Les trophées des grandes légendes : une expédition qui en rapporte un est « légendaire » */
/** Les expéditions du volcan : sur son île, qu'on gagne en barque (ou à pied, s'il est sur la terre du village) */
export const VOLCANIC = new Set<Scene>(['obsidian', 'ascent', 'eruption']);

const LEGENDS = new Set(['megalodon', 'kraken', 'dragon', 'stag', 'games', 'moon', 'colony']);
export const isLegendary = (m: Mission) => m.id === 'mammoth' || m.choices.some((c) => c.win.some((e) => e.t === 'perk' && LEGENDS.has(e.id)));
/** Expéditions armées : une troupe de soldats, ou une chasse aux bêtes dangereuses */
export const isMilitary = (m: Mission) => m.id === 'wolf' || m.choices.some((c) => !!c.troop);
export const mandatoriesFor = (age: number) => MISSIONS.filter((m) => m.age === age && m.mandatory);
/** La première mission obligatoire de l'âge */
export const mandatoryFor = (age: number) => mandatoriesFor(age)[0] ?? null;

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
  /** équipement emporté par les équipes en route : une expédition en route n'est pas sauvegardée, il revient en réserve au chargement */
  away: Stock;
  /** fabrication en cours, dans l'ordre, et avancement de la première pièce (secondes de jeu) */
  craft: GearId[];
  craftT: number;
  /** chevaux partis avec une troupe (relu à 0 : une expédition en route n'est pas sauvegardée) */
  riding: number;
  /** derniers imprévus survenus, du plus ancien au plus récent : les prochaines expéditions en tirent d'autres */
  recent: string[];
  /** 1 une fois le volet maritime connu de la partie (les anciennes sauvegardes n'ont pas ce champ : voir `readExpState`) */
  sea: number;
  /** temps écoulé vers le prochain poulain des écuries (secondes de jeu, voir `breedHorses` ; 0 pour les anciennes sauvegardes) */
  foal: number;
  /**
   * missions des équipes en route (une entrée par équipe). Elles ne sont pas sauvegardées : au chargement, cette liste dit
   * au joueur quelles équipes sont rentrées sans rien rapporter (`Game.warnLostTeams` la vide ; anciennes sauvegardes : vide)
   */
  out: string[];
}

/** Imprévus récents dont on se souvient (les deux ou trois dernières expéditions) */
export const RECENT_EVENTS = 6;

export const newExpState = (): ExpState => ({ done: [], perks: [], herd: [], bonus: { food: 0, water: 0, jobs: 0, joy: 0 }, temp: [], clock: 0, gear: emptyStock(), away: emptyStock(), craft: [], craftT: 0, riding: 0, recent: [], sea: 1, foal: 0, out: [] });

/** Relit l'état sauvegardé (anciennes sauvegardes : état vierge) */
export function readExpState(d: any): ExpState {
  const s = newExpState();
  if (!d || typeof d !== 'object') return s;
  const ids = new Set(MISSIONS.map((m) => m.id));
  // (le plan des galeries du monde souterrain, retiré, s'oublie)
  s.perks = Array.isArray(d.perks) ? d.perks.filter((x: any) => typeof x === 'string' && x !== 'map') : [];
  const was: string[] = Array.isArray(d.done) ? d.done : [];
  // (les sauvegardes d'avant la séparation : « le monstre des mers » réussi vaut le kraken, l'obligatoire de l'Antiquité, quelle
  // qu'ait été la proie ; et le mégalodon s'il en a rapporté les dents. Le trophée, lui, suit le savoir-faire rapporté)
  const old = was.includes('monster') ? ['kraken', ...(s.perks.includes('megalodon') ? ['megalodon'] : [])] : [];
  s.done = [...new Set([...was, ...old])].filter((x: any) => ids.has(x));
  // (une partie d'avant les savoir-faire des expéditions, qui en a déjà réussi une, le reçoit : voir `legacy.ts`)
  grantLegacies(s.done, s.perks);
  // (une partie d'avant les armes d'obsidienne, qui a déjà rapporté la pierre noire du volcan, en a le savoir-faire)
  if (s.done.includes('obsidian') && !s.perks.includes('obsidian')) s.perks.push('obsidian');
  s.herd = Array.isArray(d.herd) ? d.herd.filter((x: any) => ['sheep', 'cow', 'pig', 'horse'].includes(x)) : [];
  for (const k of Object.keys(s.bonus) as NeedKey[]) s.bonus[k] = +d.bonus?.[k] || 0;
  s.temp = Array.isArray(d.temp) ? d.temp.filter((t: any) => t && t.need in s.bonus && isFinite(t.n) && isFinite(t.until)) : [];
  s.clock = +d.clock || 0;
  s.foal = Math.max(0, +d.foal || 0);
  for (const k of Object.keys(s.gear) as GearId[]) s.gear[k] = Math.max(0, Math.floor(+d.gear?.[k] || 0));
  // l'équipement des équipes en route revient en réserve (elles ne sont pas sauvegardées ; les anciennes sauvegardes le perdaient)
  for (const k of Object.keys(s.gear) as GearId[]) s.gear[k] += Math.max(0, Math.floor(+d.away?.[k] || 0));
  s.craft = Array.isArray(d.craft) ? d.craft.filter((x: any) => x in GEAR_BY) : [];
  s.craftT = +d.craftT || 0;
  // (les sauvegardes d'avant ne s'en souviennent pas : rien d'évité)
  // (les sauvegardes d'avant le volet maritime : la caravelle, obligatoire au Moyen Âge, ne bloque pas qui a déjà fini les autres
  // obligatoires de cet âge ou ouvert l'âge suivant ; son chantier naval est alors disponible)
  if (!d.sea) {
    const ageOf = (id: string) => MISSIONS.find((m) => m.id === id)?.age ?? 0;
    if (!s.done.includes('caravel') && (['mine', 'dragon'].every((x) => s.done.includes(x)) || s.done.some((x) => ageOf(x) >= 3))) s.done.push('caravel');
  }
  s.recent = Array.isArray(d.recent) ? d.recent.filter((x: any) => typeof x === 'string').slice(-RECENT_EVENTS) : [];
  s.out = Array.isArray(d.out) ? d.out.filter((x: any) => ids.has(x)) : [];
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
    else if (e.t === 'diplo') { if (e.act === 'victory') claimVictory(w); else applyDiplo(w.diplo, e.act); }
    else if (e.t === 'boon') addBoon(w.diplo, e.kind, e.n);
    else if (e.t === 'gold') w.gold += e.n;
  }
  w.version++;
  return { injured, days };
}

const NEED_ICON: Record<NeedKey, string> = { food: '🍞', water: '💧', jobs: '🔨', joy: '😊' };
const HERD_NAME: Record<HerdKind, [string, string]> = { sheep: ['mouton', 'moutons'], cow: ['vache', 'vaches'], pig: ['cochon', 'cochons'], horse: ['cheval', 'chevaux'] };
const PERK_NAME: Record<string, string> = { seeds: 'blé des collines : champs +30 %', furs: 'peaux de mammouth : des fourrures pour tout le camp', megalodon: 'dents de mégalodon : un trophée sur la place du village', kraken: 'tentacule de kraken : un trophée sur la place du village', dragon: 'le trésor du dragon : sa légende court dans tout le pays', games: 'les Jeux du village : le monde entier connaît son stade', moon: 'le drapeau du village sur la Lune', colony: 'une colonie sur une autre planète' };

PERK_NAME.caravel = 'la caravelle a tenu la mer : le chantier naval est ouvert';
PERK_NAME.spices = 'les épices des îles lointaines garnissent les tables : chaque taverne +2 bien-être';
PERK_NAME.galleon = 'le trésor du galion englouti est au village';
PERK_NAME.portal = 'le portail de l’autre rive est ouvert : tours de garde et caserne sur son île';
PERK_NAME.hellking = 'la couronne du roi des Enfers : un trophée sur la place du village';
PERK_NAME.isleSmiths = 'les outils des forgerons alliés : l’équipement se fabrique 30 % plus vite';
PERK_NAME.isleSeeds = 'les semences des jardins rivaux : champs +15 %';
PERK_NAME.obsidian = 'les tailleurs d’obsidienne : lances et épées d’obsidienne';
PERK_NAME.stag = 'les bois du cerf blanc : un trophée sur la place du village';
PERK_NAME.sulfur = 'le soufre du cratère : les mines donnent 30 % de minerai en plus';
PERK_NAME.hounds = 'des chiens de garde : ils suivent les patrouilles, la garde porte plus loin, les bêtes font moins peur';
PERK_NAME.coalfire = 'des fourneaux au charbon : équipement 25 % plus vite, briqueteries +30 %';
PERK_NAME.railfast = 'le grand tracé : trains 25 % plus rapides, et les gares de marchandises font produire le double';
PERK_NAME.dikes = 'des digues et des tranchées : la lave et les crues épargnent le village';
PERK_NAME.meteo = 'la station météo du sommet : les expéditions craignent moins les intempéries, les clubs alpins attirent du monde';
PERK_NAME.trawlers = 'des chalutiers : pontons, ports et halles aux poissons nourrissent 30 % de plus';
PERK_NAME.cropisles = 'des îles de culture : les fermes marines nourrissent 50 % de plus';
PERK_NAME.satellites = 'des satellites : volcans et catastrophes annoncés plus tôt, navires mieux guidés';
PERK_NAME.hellforge = 'la forge infernale : l’équipement se fabrique plus vite, les expéditions sont plus sûres';

/** Ce que la diplomatie gagne, en clair et en pastille */
const DIPLO_NAME: Record<DiploAct, string> = { meet: 'les deux peuples des îles rencontrés', post: 'un comptoir chez le rival de notre allié', truce: 'la trêve des deux îles : les combats cessent', feast: 'l’amitié des trois peuples', landing: 'la côte reconnue : la bataille peut commencer', victory: 'la guerre gagnée : butin et tribut d’or', bid: 'la candidature des Jeux des îles acceptée', scoutBeach: 'la plage de débarquement repérée', scoutGarrison: 'la garnison rivale comptée', scoutChief: 'le chef rival repéré', scoutGate: 'la porte faible repérée' };
const DIPLO_ICON: Record<DiploAct, string> = { meet: '🤝', post: '⚖️', truce: '📜', feast: '🎉', landing: '🔭', victory: '🏆', bid: '🏟️', scoutBeach: '🏖️', scoutGarrison: '🛡️', scoutChief: '👑', scoutGate: '🚪' };

/** Un avantage pour le dénouement, en clair (« +4 troupes alliées pour la bataille », « +10 % de chances pour la paix ») */
export function boonText(kind: BoonKind, n: number, short = false) {
  if (short) {
    if (kind === 'allies') return tr('+{n} troupes alliées', { n });
    if (kind === 'ours') return tr('+{n} de nos soldats', { n });
    if (kind === 'foes') return tr('−{n} ennemis', { n });
    return n >= 0 ? `+${n} %` : `−${-n} %`;
  }
  if (kind === 'allies') return tr('+{n} troupes alliées pour la bataille', { n });
  if (kind === 'ours') return tr('+{n} de nos soldats pour la bataille', { n });
  if (kind === 'foes') return tr('−{n} ennemis à la bataille', { n });
  return n >= 0 ? tr('+{n} % de chances pour la paix', { n }) : tr('−{n} % de chances pour la paix', { n: -n });
}
export const BOON_ICON: Record<BoonKind, string> = { allies: '🛡', ours: '⚔', foes: '🎯', peace: '📜' };

/** La dernière expédition, réussie : la fin de la partie (on peut continuer à bâtir) */
export const VICTORY = 'colony';

/** Les effets en quelques mots (« 4 moutons · +3 🍞 · 1 blessé ») */
export function effectSummary(effects: Effect[]) {
  const out: string[] = [];
  for (const e of effects) {
    if (e.t === 'herd') {
      const n: Partial<Record<HerdKind, number>> = {};
      for (const k of e.kinds) n[k] = (n[k] ?? 0) + 1;
      for (const [k, c] of Object.entries(n) as [HerdKind, number][]) out.push(`${c} ${plural(c, ...HERD_NAME[k])}`);
    } else if (e.t === 'ore') out.push(tr('+{n} minerai', { n: e.n }));
    else if (e.t === 'need') out.push(`${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} ${NEED_ICON[e.need]}${e.days ? ` (${tr('{n} j', { n: e.days })})` : ''}`);
    else if (e.t === 'perk') out.push(PERK_NAME[e.id] ? tr(PERK_NAME[e.id]) : e.id);
    else if (e.t === 'injured') out.push(`${e.n} ${plural(e.n, 'blessé', 'blessés')} (${tr('{n} j', { n: e.days })})`);
    else if (e.t === 'unherd') out.push(`−${e.n} ${plural(e.n, ...HERD_NAME[e.kind])}`);
    else if (e.t === 'diplo') out.push(tr(DIPLO_NAME[e.act]));
    else if (e.t === 'boon') out.push(boonText(e.kind, e.n));
    else if (e.t === 'gold') out.push(tr('+{n} or', { n: e.n }));
  }
  return out.join(' · ') || tr('rien');
}

const HERD_ICON: Record<HerdKind, string> = { sheep: '🐑', cow: '🐄', pig: '🐖', horse: '🐎' };

/** Les effets en pastilles (« 🐑 4 », « ⛏️ +3 », « 🍞 +3 ») : une icône, un chiffre, et la phrase complète en infobulle */
export function effectChips(effects: Effect[]): { icon: string; n: string; title: string }[] {
  const out: { icon: string; n: string; title: string }[] = [];
  for (const e of effects) {
    const title = effectSummary([e]);
    if (e.t === 'herd') {
      const n: Partial<Record<HerdKind, number>> = {};
      for (const k of e.kinds) n[k] = (n[k] ?? 0) + 1;
      for (const [k, c] of Object.entries(n) as [HerdKind, number][]) out.push({ icon: HERD_ICON[k], n: `${c}`, title: `${c} ${plural(c, ...HERD_NAME[k])}` });
    } else if (e.t === 'ore') out.push({ icon: '⛏️', n: `+${e.n}`, title });
    else if (e.t === 'need') out.push({ icon: NEED_ICON[e.need], n: `${e.n > 0 ? '+' : '−'}${Math.abs(e.n)}${e.days ? ` · ${tr('{n} j', { n: e.days })}` : ''}`, title });
    else if (e.t === 'perk') out.push({ icon: '⭐', n: tr('savoir-faire'), title });
    else if (e.t === 'injured') out.push({ icon: '🤕', n: `${e.n}`, title });
    else if (e.t === 'unherd') out.push({ icon: HERD_ICON[e.kind], n: `−${e.n}`, title });
    else if (e.t === 'diplo') out.push({ icon: DIPLO_ICON[e.act], n: '', title });
    else if (e.t === 'boon') out.push({ icon: BOON_ICON[e.kind], n: e.kind === 'peace' ? `${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} %` : `${e.kind === 'foes' ? '−' : '+'}${e.n}`, title });
    else if (e.t === 'gold') out.push({ icon: '💰', n: `+${e.n}`, title });
  }
  return out;
}

/**
 * Les récompenses d'un choix en pastilles, sans doublon d'icône, les gains propres à la mission d'abord : savoir-faire,
 * diplomatie, bêtes, or, avantages pour le dénouement, puis minerai et besoins. `max` : les premières seulement. La fenêtre de
 * départ n'en montre que trois : « La pierre noire du volcan » n'y montrait que son minerai, son travail et son bien-être, et
 * pas les armes d'obsidienne qu'elle débloque (notes de joueurs du 22 nov. 2026)
 */
export function giftChips(effects: Effect[], max = Infinity): { icon: string; n: string; title: string }[] {
  const RANK: Record<Effect['t'], number> = { perk: 0, diplo: 1, herd: 2, gold: 3, boon: 4, ore: 5, need: 6, injured: 7, unherd: 8 };
  const ranked = effects.map((e, i) => ({ e, i })).sort((a, b) => RANK[a.e.t] - RANK[b.e.t] || a.i - b.i).map((x) => x.e);
  const seen = new Set<string>();
  return effectChips(ranked).filter((c) => (seen.has(c.icon) ? false : (seen.add(c.icon), true))).slice(0, max);
}

/** Une intro en deux temps : sa première phrase (ce qu'on affiche) et le reste (replié sous « En savoir plus »). Rien n'est perdu : head + rest = le texte */
export function splitIntro(text: string): { head: string; rest: string } {
  const m = /^.*?[.!?…](?=\s|$)/s.exec(text);
  const head = m ? m[0] : text;
  return { head, rest: text.slice(head.length).trim() };
}
