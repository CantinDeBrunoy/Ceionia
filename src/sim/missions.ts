import type { World } from '../world/world';
import { Danger, GearId, Stock, emptyStock, GEAR_BY } from './gear';
import type { KindId } from '../build/catalog';

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
  // le volet maritime : voyage de découverte ou de commerce au large, chasse à l'épave, pêche en haute mer
  | 'voyage' | 'wreck' | 'trawl';

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
  | { t: 'unherd'; kind: HerdKind; n: number };

/** Le choix tel qu'il se présente à cet âge : ses libellés et son récit de l'âge le plus proche, en dessous ou égal */
export function choiceAt(c: Choice, age: number): Choice {
  if (!c.ages) return c;
  const keys = Object.keys(c.ages).map(Number).filter((k) => k <= age).sort((p, q) => p - q);
  return keys.length ? { ...c, ...Object.assign({}, ...keys.map((k) => c.ages![k])) } : c;
}

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
  carry?: 'animals' | 'cart' | 'sacks' | 'guests' | 'sledge';
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
  /** chevaux de l'écurie qu'emmène la troupe (ils reviennent avec elle) */
  mounts?: number;
  /** carburant brûlé par les véhicules de la troupe (pris au départ, raffiné du pétrole brut des puits) */
  fuel?: number;
  /** troupe (moteur du monde souterrain, gardé pour les Enfers : telle qu'on la verrait sous terre) */
  troop?: 'cavalry' | 'armor' | 'miners';
  /**
   * ce qui change avec les âges (à partir de l'âge donné) : nom et récit (chevaliers, puis cuirassiers et fusiliers…), et à
   * l'époque moderne ce qu'il faut emmener (du carburant pour les blindés au lieu des chevaux) et ce qu'un échec coûte
   */
  ages?: Partial<Record<number, Partial<Pick<Choice, 'label' | 'text' | 'doing' | 'winText' | 'loseText' | 'mounts' | 'fuel' | 'lose'>>>>;
  /** ce qu'on voit de l'échec sur la scène, au départ de l'équipe (l'orage, la pirogue qui chavire, la pierre qui roule…) */
  fail?: Fail;
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
  /** se refait autant de fois qu'on veut */
  repeat?: boolean;
  /** ce qu'il faut avant de partir : missions réussies, bâtiments bâtis */
  requires?: { missions?: string[]; kinds?: KindId[] };
  /**
   * le grand départ (les colons vers une autre planète) : tout le village les accompagne et les acclame, ils ne reviennent
   * pas, et l'expédition ne peut pas échouer
   */
  farewell?: boolean;
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
        label: 'Suivre le troupeau dans la plaine', text: 'Long mais sûr : on marche avec les moutons jusqu’à ce qu’ils se laissent approcher.',
        dest: 'plain', scene: 'herd', fail: 'storm', doing: 'marche avec les moutons jusqu’à ce qu’ils se laissent approcher', party: 3, work: 24, risk: 0.15, carry: 'animals',
        win: [{ t: 'herd', kinds: ['sheep', 'sheep', 'sheep', 'sheep'] }, food(3)], lose: [],
        winText: 'Le troupeau a suivi les chasseurs jusqu’au camp, sans se presser. Les moutons broutent maintenant près des fermes.',
        loseText: 'Un orage a éclaté et dispersé le troupeau. Les chasseurs rentrent bredouilles, mais ils retenteront leur chance.',
      },
      {
        label: 'Bâtir un enclos de branchages en lisière', text: 'On rabat les bêtes de la forêt dans un enclos : il faut des bras, et les sangliers sont farouches.',
        dest: 'forest', scene: 'corral', fail: 'charge', doing: 'rabat les bêtes dans un enclos de branchages', party: 4, work: 30, risk: 0.25, carry: 'animals',
        win: [{ t: 'herd', kinds: ['pig', 'pig', 'pig', 'sheep', 'sheep'] }, food(4)], lose: [hurt(1, 2)],
        winText: 'L’enclos a tenu : sangliers et moutons ont été menés au village, et ils s’y plaisent.',
        loseText: 'Un sanglier a forcé l’enclos et blessé un chasseur. Il se repose à la hutte.',
      },
      {
        label: 'Attirer les aurochs avec du sel', text: 'Rapide mais risqué : près de la rivière, les aurochs viennent lécher le sel… quand ils sont d’humeur.',
        dest: 'river', scene: 'salt', fail: 'charge', doing: 'attend, cachée, que les aurochs viennent lécher le sel', danger: ['beast', 'water'], party: 2, work: 14, risk: 0.4, carry: 'animals',
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
    id: 'flint', age: 0, mandatory: false, icon: '⛏️', title: 'La chasse au silex',
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
        label: 'Suivre les abeilles jusqu’à leur essaim', text: 'Patient : on suit leur vol de fleur en fleur, jusqu’à un essaim posé dans la plaine.',
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
    intro: 'Une harde de mammouths descend des glaciers et passe non loin du camp. Un seul de ces géants laineux nourrirait tout le monde pendant des lunes, et ses peaux tiendraient chaud tout l’hiver… mais un mammouth, ça se chasse à plusieurs, et avec ruse.',
    choices: [
      {
        label: 'Pièges et fosses', text: 'Long mais sûr : on creuse des fosses sur le passage de la harde, on les couvre de branchages, et l’on attend qu’un mammouth s’y prenne les pattes.',
        dest: 'plain', scene: 'mammoth', fail: 'scatter', doing: 'creuse des fosses sur le passage de la harde et guette les mammouths', danger: ['beast', 'weather'], party: 4, work: 30, risk: 0.2, carry: 'sledge',
        win: [food(6, 6), food(2), joy(2, 5), joy(1), { t: 'perk', id: 'furs' }], lose: [],
        winText: 'Le vieux mâle s’est pris les pattes dans une fosse : les chasseurs rentrent, le traîneau chargé de viande et de peaux. Ce soir, grande fête autour du feu !',
        loseText: 'La harde a flairé les fosses et fait un grand détour. Les chasseurs rentrent les mains vides, mais les fosses attendront la prochaine fois.',
      },
      {
        label: 'Rabattre la harde vers le ravin', text: 'Rapide mais risqué : torches et grands cris, on pousse les mammouths vers un ravin où le plus vieux restera coincé. Un mammouth affolé, ça charge !',
        dest: 'mountain', scene: 'mammoth', fail: 'charge', doing: 'rabat la harde vers le ravin, torches et lances en main', danger: ['beast', 'fall'], party: 5, work: 18, risk: 0.4, carry: 'sledge',
        win: [food(8, 6), food(2), joy(3, 5), joy(1), { t: 'perk', id: 'furs' }], lose: [hurt(2, 2), joy(-1, 3)],
        winText: 'La harde a dévalé la pente et le vieux mâle est resté coincé au fond du ravin : jamais le camp n’a vu autant de viande et de fourrures !',
        loseText: 'Le vieux mâle a fait volte-face et chargé les rabatteurs : deux chasseurs sont blessés, et la harde s’est enfuie dans la montagne.',
      },
      {
        label: 'Suivre la harde à distance', text: 'Patient : on suit les mammouths au-delà des collines sans se montrer, jusqu’à ce qu’un vieux mâle fatigué traîne loin derrière les autres.',
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
        label: 'Chercher les grands bancs au loin', text: 'Plus de poisson, plus de chemin : on prend le large.',
        dest: 'river', sea: true, scene: 'boat', fail: 'storm', doing: 'pêche au large les grands bancs', danger: ['water', 'weather'], party: 3, work: 20, risk: 0.25, carry: 'sacks',
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
    // expédition armée en haute mer : deux galères, des hommes d'armes à pied (pas de chevaux), des harpons ; l'obligatoire de
    // l'Antiquité (l'ancienne « chasse au monstre des mers », voir `readExpState`)
    id: 'kraken', age: 1, mandatory: true, icon: '🐙', title: 'Chasser le kraken',
    intro: 'Un géant à tentacules rôde au large et attrape les navires. Une troupe d’hommes d’armes embarque sur deux galères, harpons en main : il est temps de le chasser !',
    choices: [
      {
        label: 'Trancher ses tentacules', text: 'Les deux galères foncent sur lui, harpons et haches en main. Plus risqué, mais quelle gloire !',
        dest: 'river', sea: true, scene: 'kraken', fail: 'capsize', doing: 'tranche les tentacules du kraken, harpons en main', danger: ['monster', 'water'], party: 5, work: 38, risk: 0.55, carry: 'sacks',
        win: [food(3, 5), joy(5, 6), joy(2), { t: 'ore', n: 10 }, { t: 'perk', id: 'kraken' }], lose: [hurt(3, 4), joy(-3, 4)],
        winText: 'Le kraken a lâché les galères et fui dans les profondeurs, un tentacule en moins : la légende est née ! Des perles et du minerai remontent avec lui.',
        loseText: 'Les tentacules ont brisé les rames et secoué les galères : trois blessés, et le kraken est toujours là.',
      },
      {
        label: 'Le prendre en tenaille', text: 'Une galère de chaque côté : il ne sait plus où frapper. Plus long, un peu plus sûr.',
        dest: 'river', sea: true, scene: 'kraken', fail: 'capsize', doing: 'prend le kraken en tenaille entre ses deux galères', danger: ['monster', 'water'], party: 6, work: 44, risk: 0.45, carry: 'sacks',
        win: [food(3, 5), joy(4, 6), joy(2), { t: 'ore', n: 8 }, { t: 'perk', id: 'kraken' }], lose: [hurt(2, 4), joy(-2, 4)],
        winText: 'Pris entre les deux galères, le kraken a plongé pour ne plus revenir : la légende est née ! Des perles et du minerai remontent avec lui.',
        loseText: 'Le kraken a glissé entre les deux galères et en a secoué une : deux blessés, et il rôde toujours.',
      },
    ],
  },
  {
    // l'île du portail (voir `world/portal.ts`) : la galère traverse le bras de mer, l'équipe débarque, explore l'île et
    // réveille le portail ; obligatoire (elle ouvre l'île), puis il faut sécuriser l'île (`isleSecured`, condition d'âge),
    // jamais la conquête des Enfers. Sans île (partie d'avant elle), elle n'est pas disponible (`Expeditions.why`) ni demandée
    id: 'portal', age: 1, mandatory: true, icon: '🌀', title: 'Le portail de l’autre rive', unlocks: 'watchtower',
    intro: 'Au large, de l’autre côté du bras de mer, une petite île rougeoie certaines nuits. Les pêcheurs jurent qu’une arche de pierre noire s’y dresse, et qu’on entend gronder au-delà… Une galère pourrait y mener quelques braves.',
    choices: [
      {
        label: 'Traverser à la rame et réveiller l’arche', text: 'La galère file droit vers l’île ; l’équipe débarque, cherche l’arche et allume ses braseros.',
        dest: 'river', sea: true, scene: 'portal', fail: 'storm', doing: 'explore l’île et réveille le portail', danger: ['water', 'weather'], party: 4, work: 30, risk: 0.25, carry: 'sacks',
        win: [{ t: 'perk', id: 'portal' }, joy(2, 4)], lose: [hurt(1, 2)],
        winText: 'Les braseros flambent, les runes s’allument, et entre les pierres de l’arche un tourbillon rouge et violet s’est mis à tourner : le portail est ouvert ! Sur l’île, on peut maintenant bâtir des tours de garde, puis une caserne.',
        loseText: 'Une tempête s’est levée sur le bras de mer : la galère a dû rebrousser chemin, et un rameur s’est blessé. Il faudra retenter la traversée.',
      },
      {
        label: 'Attendre une mer d’huile', text: 'Plus long, plus sûr : on guette le calme plat avant de traverser, et l’on prend le temps d’étudier les runes.',
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
    intro: 'Un requin gros comme une maison fend la haute mer de son aileron et coule les barques des pêcheurs. Deux galères d’hommes d’armes partent le chasser, harpons en main.',
    choices: [
      {
        label: 'Le harponner au large', text: 'Les deux galères l’encadrent et le criblent de harpons. Ses dents valent de l’or… s’il ne vous croque pas.',
        dest: 'river', sea: true, scene: 'megalodon', fail: 'capsize', doing: 'harponne le mégalodon depuis ses deux galères', danger: ['monster', 'water'], party: 5, work: 34, risk: 0.45, carry: 'sacks',
        win: [food(5, 5), joy(3, 5), joy(1), { t: 'ore', n: 6 }, { t: 'perk', id: 'megalodon' }], lose: [hurt(2, 3), joy(-2, 3)],
        winText: 'Les harpons ont frappé juste : le mégalodon est vaincu ! Sa viande nourrit le village, et ses dents géantes ornent la place.',
        loseText: 'Un coup de queue, et une galère a chaviré : les hommes d’armes rentrent à la nage, deux sont blessés.',
      },
      {
        label: 'L’appâter avec une carcasse', text: 'Une baleine morte traînée entre les galères : il viendra à elle. Plus long, plus sûr.',
        dest: 'river', sea: true, scene: 'megalodon', fail: 'capsize', doing: 'attire le mégalodon vers l’appât, harpons levés', danger: ['monster', 'water'], party: 5, work: 40, risk: 0.35, carry: 'sacks',
        win: [food(4, 5), joy(3, 5), joy(1), { t: 'ore', n: 5 }, { t: 'perk', id: 'megalodon' }], lose: [hurt(1, 3), joy(-1, 3)],
        winText: 'Le mégalodon a mordu à l’appât, et les harpons ont fait le reste : ses dents géantes ornent la place.',
        loseText: 'Le mégalodon a emporté l’appât d’un coup de mâchoire et filé vers le large ; un rameur blessé.',
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
        loseText: 'Les torches se sont éteintes dans la grotte ; deux explorateurs se sont blessés en ressortant.',
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
        dest: 'far', scene: 'troupe', fail: 'gone', doing: 'applaudit les jongleurs et les invite au village', danger: ['weather'], party: 2, work: 10, risk: 0.15, carry: 'guests',
        win: [joy(5, 5)], lose: [],
        winText: 'La troupe est arrivée en musique : fête au village pendant des jours !',
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
        label: 'Cueillir le houblon sauvage au bord de l’eau', text: 'On rapporte le houblon d’abord ; le frère viendra goûter.',
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
    intro: 'Un dragon s’est terré dans une grotte au pied de la montagne : il enlève les moutons et roussit les toits. On dit qu’il dort sur un tas d’or… Des chevaliers sont prêts à l’en déloger.',
    choices: [
      {
        label: 'L’affronter dans sa grotte', text: 'Épées, arbalètes et boucliers : on le défie à l’entrée de son antre. Le plus court, et le plus dangereux.',
        dest: 'cave', scene: 'dragon', doing: 'affronte le dragon à l’entrée de sa grotte', danger: ['monster', 'dark'], party: 5, work: 32, risk: 0.45, carry: 'cart',
        win: [{ t: 'ore', n: 16 }, joy(4, 6), joy(2), { t: 'perk', id: 'dragon' }], lose: [hurt(2, 3), joy(-2, 3)],
        winText: 'Le dragon s’est effondré devant sa grotte ! Les chevaliers rentrent avec son trésor : de l’or et du fer plein le chariot.',
        loseText: 'Le dragon a craché le feu et pris son envol : deux chevaliers brûlés, et la bête rôde toujours.',
      },
      {
        label: 'L’enfumer hors de sa grotte', text: 'Un grand feu d’herbes humides devant l’entrée : à moitié étouffé, il sortira affaibli. Plus long, plus sûr.',
        dest: 'cave', scene: 'dragon', doing: 'enfume la grotte du dragon et l’attend, arbalètes braquées', danger: ['monster', 'dark'], party: 4, work: 40, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }, joy(3, 6), joy(2), { t: 'perk', id: 'dragon' }], lose: [hurt(1, 2), joy(-1, 3)],
        winText: 'Le dragon est sorti en toussant, et les carreaux d’arbalète ont fait le reste ! Son trésor rentre au village sur le chariot.',
        loseText: 'Le dragon a jailli de la fumée et s’est envolé par-dessus la montagne : un chevalier brûlé.',
      },
    ],
  },
  {
    // obligatoire (le volet maritime du Moyen Âge) : la caravelle ouvre le chantier naval, d'où sortiront les navires du village
    id: 'caravel', age: 2, mandatory: true, icon: '⛵', title: 'La caravelle', unlocks: 'shipyard',
    intro: 'Les charpentiers ont dessiné une caravelle : trois mâts, des voiles latines, de quoi tenir la haute mer. Avant de lui bâtir un chantier, il faut l’essayer et tracer une première route au large.',
    choices: [
      {
        label: 'Longer la côte à la voile', text: 'Prudent : on garde la terre en vue, longue-vue et cartes en main.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'longe la côte à la voile, la longue-vue à la main', danger: ['water', 'weather'], party: 3, work: 24, risk: 0.25, carry: 'sacks',
        win: [{ t: 'perk', id: 'caravel' }, joy(2, 5), food(2, 5)], lose: [hurt(1, 2)],
        winText: 'La caravelle a tenu la mer : la côte est cartographiée, les marins sont fiers. Les charpentiers réclament leur chantier naval.',
        loseText: 'Un grain a couché les voiles et brisé une vergue ; un marin s’est blessé. La caravelle est rentrée à la rame.',
      },
      {
        label: 'Prendre le large, cap à l’ouest', text: 'Audacieux : trois jours hors de vue de la terre, pour trouver de nouvelles routes.',
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
    intro: 'Le but : rapporter des épices au village. Un navire marchand part du chantier naval vers des comptoirs lointains, y troque laine et fer contre poivre, safran et soieries, puis revient. Au retour : de quoi mieux manger, du bonheur, et des échanges qui rapportent du minerai. Route courte et sûre, ou longue et risquée mais plus riche.',
    choices: [
      {
        label: 'Charger le poivre aux comptoirs proches', text: 'Une traversée courte, sans histoires : on troque de la laine et du fer contre des sacs d’épices.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'fog', doing: 'troque laine et fer contre des sacs d’épices', danger: ['water'], party: 3, work: 22, risk: 0.2, carry: 'sacks',
        win: [food(3, 8), joy(2, 6), jobs(1)], lose: [hurt(1, 1)],
        winText: 'Des sacs de poivre et de cannelle plein la cale : les tables du village sentent bon, et les marchands sont ravis.',
        loseText: 'Pris dans la brume, le navire a perdu sa route et il est rentré à vide.',
      },
      {
        label: 'Pousser jusqu’aux îles aux épices', text: 'Une longue route, des pirates peut-être, mais un chargement de soies, de safran et de gingembre.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'pousse jusqu’aux îles aux épices et charge la cale', danger: ['water', 'weather'], party: 4, work: 36, risk: 0.4, carry: 'sacks',
        win: [food(5, 8), joy(4, 8), jobs(2), { t: 'ore', n: 10 }, { t: 'perk', id: 'spices' }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Les îles aux épices ! La cale déborde de soies et de safran : le marché du village n’a jamais été aussi animé.',
        loseText: 'Des pirates ont donné la chasse au navire : deux marins blessés, la cargaison jetée à la mer.',
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
        dest: 'mountain', scene: 'gallery', fail: 'rocks', doing: 'perce le tunnel et sort les déblais', party: 4, work: 30, risk: 0.35, carry: 'cart',
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
        dest: 'cave', scene: 'cave', fail: 'blast', doing: 'descend dans la grotte, lampe au front', party: 3, work: 18, risk: 0.3, carry: 'cart',
        win: [{ t: 'ore', n: 12 }], lose: [hurt(1, 2)],
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
        dest: 'plain', scene: 'race', doing: 'prépare la voiture et file sur la route de la course', party: 3, work: 22, risk: 0.15,
        win: [jobs(3), joy(1)], lose: [],
        winText: 'La voiture franchit la ligne sous les vivats : l’ingénieur ouvre une usine au village, et les premières automobiles remplacent les charrettes.',
        loseText: 'Une roue cassée dans le fossé : la voiture rentre en remorque.',
      },
      {
        label: 'Pousser la machine à fond', text: 'La victoire, ou le fossé.',
        dest: 'plain', scene: 'race', doing: 'pousse la voiture à fond sur la route de la course', party: 3, work: 18, risk: 0.35,
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
        dest: 'plain', scene: 'balloon', doing: 'gonfle la montgolfière et tient les cordes', party: 4, work: 20, risk: 0.15,
        win: [joy(2)], lose: [hurt(1, 1)],
        winText: 'Le ballon s’élève au-dessus du village sous les applaudissements : un aérodrome s’ouvre, montgolfières et dirigeable y viendront.',
        loseText: 'Un coup de vent a couché le ballon : une main brûlée au brûleur.',
      },
      {
        label: 'Décoller du col, dans les vents de la montagne', text: 'Plus haut, plus loin, plus risqué.',
        dest: 'mountain', scene: 'balloon', doing: 'gonfle la montgolfière au col et guette le vent', party: 3, work: 24, risk: 0.3,
        win: [joy(3), { t: 'ore', n: 3 }], lose: [hurt(1, 2)],
        winText: 'Le ballon a survolé toute la région ; de là-haut on a repéré un filon. L’aérodrome ouvre ses portes.',
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
        dest: 'plain', scene: 'drill', doing: 'fore un puits d’essai là où le brut suinte', party: 2, work: 12, risk: 0.1, carry: 'cart',
        win: [jobs(2)], lose: [],
        winText: 'Le pétrole jaillit du puits d’essai ! L’ingénieur promet sa raffinerie : bâtissez-la, avec des puits de pétrole sur les taches sombres.',
        loseText: 'Rien que de l’eau boueuse : il faudra forer ailleurs.',
      },
      {
        label: 'Suivre les suintements au-delà des collines', text: 'Plus loin, un gisement plus riche.',
        dest: 'far', scene: 'drill', doing: 'suit les suintements et fore au cœur du gisement', party: 3, work: 16, risk: 0.2, carry: 'cart',
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
        label: 'Draguer le fond au large', text: 'Les chaînes de la drague raclent le fond : lent, mais sans plongeur à risquer.',
        dest: 'river', sea: true, scene: 'wreck', fail: 'storm', doing: 'drague le fond à la recherche du galion', danger: ['water', 'weather'], party: 3, work: 26, risk: 0.2, carry: 'sacks',
        win: [{ t: 'ore', n: 10 }, joy(2, 6), { t: 'perk', id: 'galleon' }], lose: [hurt(1, 1)],
        winText: 'La drague a ramené des bordages noircis, des canons et quelques lingots : le galion repose bien là.',
        loseText: 'La chaîne de la drague s’est rompue dans une houle : rien remonté, un matelot blessé.',
      },
      {
        label: 'Envoyer le scaphandrier', text: 'Casque de cuivre et pompe à bras : il descend jusqu’au pont du galion, au risque de sa vie.',
        dest: 'river', sea: true, scene: 'wreck', fail: 'capsize', doing: 'descend le scaphandrier jusqu’au pont du galion', danger: ['water'], party: 4, work: 34, risk: 0.4, carry: 'sacks',
        win: [{ t: 'ore', n: 22 }, joy(4, 6), joy(1), { t: 'perk', id: 'galleon' }], lose: [hurt(2, 3), joy(-1, 3)],
        winText: 'Le scaphandrier a ouvert les coffres du galion : de l’or et de l’argent, remontés à la pompe. Le village en parlera longtemps.',
        loseText: 'Le tuyau d’air s’est emmêlé : le scaphandrier a été remonté de justesse, et deux marins sont blessés.',
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
        dest: 'far', scene: 'basecamp', fail: 'storm', doing: 'monte le camp de base, puis la station au sommet', danger: ['weather', 'fall'], party: 4, work: 30, risk: 0.1, carry: 'sacks',
        win: [joy(3), jobs(3)], lose: [],
        winText: 'La station est installée, et le village a sa photo dans le journal.',
        loseText: 'Le mauvais temps a tout reporté.',
      },
    ],
  },
  {
    id: 'reef', age: 4, mandatory: false, icon: '🐠', title: 'Le récif',
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
        dest: 'far', scene: 'crater', doing: 'dégage la météorite de son cratère', party: 2, work: 16, risk: 0.15, carry: 'cart',
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
    intro: 'Stade, terrains, courts, bassins et station de montagne : le village a tout ce qu’il faut pour accueillir les Jeux. Athlètes du monde entier, relais de la flamme, cérémonie d’ouverture… le monde entier regardera !',
    choices: [
      {
        label: 'Une cérémonie grandiose', text: 'Relais de la flamme, défilé des nations, drapeaux et foule en délire : une fête que l’on n’oubliera pas.',
        dest: 'plain', scene: 'games', fail: 'storm', doing: 'allume la flamme au stade et ouvre les Jeux devant la foule', danger: ['weather'], party: 6, work: 34, risk: 0.2,
        win: [joy(10, 10), joy(4), jobs(4), { t: 'ore', n: 8 }, { t: 'perk', id: 'games' }], lose: [joy(-2, 4)],
        winText: 'La flamme brille au-dessus du stade, les médailles pleuvent : le monde entier parle du village ! Les visiteurs ont laissé de quoi garnir les réserves.',
        loseText: 'Un orage a noyé la cérémonie : la flamme s’est éteinte, et les Jeux se sont terminés sous les parapluies.',
      },
      {
        label: 'Des Jeux simples et joyeux', text: 'Moins de faste, plus de sport : on court, on saute, on nage, et tout le monde y gagne.',
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
    intro: 'Le marché de la mer réclame plus de poisson : un chalutier pourrait ratisser les grands fonds, loin au large, et en rapporter des tonnes.',
    choices: [
      {
        label: 'Chaluter sur le plateau', text: 'Une pêche régulière, au large mais pas trop loin : de bonnes prises sans risque inutile.',
        dest: 'river', sea: true, scene: 'trawl', fail: 'storm', doing: 'chalute sur le plateau, les filets pleins', danger: ['water', 'weather'], party: 3, work: 22, risk: 0.2, carry: 'sacks',
        win: [food(6, 8), jobs(1)], lose: [hurt(1, 1)],
        winText: 'Les filets sont remontés pleins à craquer : le marché de la mer n’a jamais autant vendu.',
        loseText: 'Le filet s’est pris dans une épave : un marin blessé, la pêche perdue.',
      },
      {
        label: 'Suivre les thons au grand large', text: 'Plus loin, plus long : des bancs de thons géants, à condition de tenir la mer.',
        dest: 'river', sea: true, scene: 'trawl', fail: 'storm', doing: 'suit les bancs de thons au grand large', danger: ['water', 'weather'], party: 4, work: 32, risk: 0.35, carry: 'sacks',
        win: [food(10, 8), food(1), joy(2, 6), jobs(2)], lose: [hurt(2, 2), joy(-1, 3)],
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
    intro: 'Au large, des îles de culture dérivent au gré des courants : algues géantes, coraux et bancs rares. L’hydroglisseur du village peut les rejoindre et les ancrer près de la ferme marine.',
    choices: [
      {
        label: 'Ancrer les îles de culture', text: 'On les remorque jusqu’à la ferme marine : lent et sûr.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'fog', doing: 'remorque les îles de culture vers la ferme marine', danger: ['water'], party: 3, work: 26, risk: 0.15, carry: 'sacks',
        win: [food(6, 10), jobs(2), joy(2, 6)], lose: [],
        winText: 'Les îles de culture sont ancrées devant la ferme marine : algues et poissons à foison.',
        loseText: 'Le brouillard a dispersé les îles : il faudra les retrouver.',
      },
      {
        label: 'Explorer l’archipel des récifs vivants', text: 'Un archipel de coraux et de bancs rares, loin de toute route.',
        dest: 'river', sea: true, scene: 'voyage', fail: 'storm', doing: 'explore l’archipel des récifs vivants', danger: ['water', 'weather'], party: 4, work: 34, risk: 0.3, carry: 'sacks',
        win: [food(8, 10), joy(4, 8), jobs(3), { t: 'ore', n: 12 }], lose: [hurt(1, 2), joy(-1, 3)],
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
        win: [joy(6), jobs(6)], lose: [joy(-3, 3)],
        winText: 'Allumage, décollage… la fusée a disparu dans le bleu du ciel, et le satellite envoie ses premiers bips : tout le village a crié de joie !',
        loseText: 'Un moteur a calé en plein vol : la fusée s’est abîmée en mer. Les ingénieurs ont déjà repris leurs plans.',
      },
      {
        label: 'Pousser les moteurs à fond', text: 'Plus haut, plus vite… et plus risqué.',
        dest: 'spaceport', scene: 'launch', doing: 'pousse les moteurs à fond et suit la fusée jusqu’en orbite', danger: ['weather'], party: 3, work: 32, risk: 0.38,
        win: [joy(8), jobs(8)], lose: [joy(-4, 4), hurt(1, 3)],
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
        dest: 'spaceport', scene: 'moon', doing: 'lance la fusée lunaire et suit l’alunissage au bord des cratères', danger: ['weather'], party: 4, work: 54, risk: 0.35,
        win: [joy(14), jobs(6), { t: 'ore', n: 12 }, { t: 'perk', id: 'moon' }], lose: [joy(-5, 4), hurt(2, 4)],
        winText: 'Le module s’est posé au bord d’un cratère géant : les astronautes rapportent des roches lunaires, du minerai inconnu et des images à couper le souffle.',
        loseText: 'Le module a heurté un rocher : les astronautes ont dû redécoller en catastrophe, et rentrent blessés.',
      },
    ],
  },
  {
    id: 'colony', age: 5, mandatory: false, icon: '🪐', title: 'Coloniser une autre planète', farewell: true,
    requires: { missions: ['moon'], kinds: ['spaceport', 'fusion'] },
    intro: 'Le dernier voyage : un vaisseau colonial, propulsé par l’énergie de la centrale à fusion, emportera des colons vers la planète bleue d’une étoile voisine. Tout le village viendra leur dire adieu, puis les accompagnera jusqu’au pas de tir. Là-bas, ils fonderont un nouveau village… comme au premier jour, autour d’un feu de camp.',
    choices: [
      {
        label: 'L’arche des colons', text: 'Un grand vaisseau, lent et sûr, avec ses serres et ses graines.',
        dest: 'spaceport', scene: 'colony', doing: 'embarque les colons et lance le vaisseau vers l’étoile voisine', danger: ['weather'], party: 5, work: 70, risk: 0,
        win: [joy(20), { t: 'perk', id: 'colony' }], lose: [],
        winText: 'Des années plus tard, un message arrive des étoiles : les colons se sont posés sur la planète bleue et y ont allumé leur premier feu de camp. Le village a essaimé dans le ciel.',
        loseText: 'Une tempête solaire a forcé le vaisseau à faire demi-tour : les colons reviennent, déçus mais sains et saufs. On réparera l’arche.',
      },
      {
        label: 'Le saut à travers l’espace', text: 'Le moteur expérimental plie l’espace : le voyage en quelques mois… si tout se passe bien.',
        dest: 'spaceport', scene: 'colony', doing: 'embarque les colons et allume le moteur expérimental', danger: ['weather'], party: 5, work: 56, risk: 0,
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
  return effects.filter((e) => e.t !== 'perk').map((e) => (e.t === 'need' && !e.days ? { ...e, days: REDO_DAYS } : e));
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

/** Les missions obligatoires de l'âge : toutes à réussir pour ouvrir l'âge suivant (deux à la Préhistoire) */
/** Les trophées des grandes légendes : une expédition qui en rapporte un est « légendaire » */
const LEGENDS = new Set(['megalodon', 'kraken', 'dragon', 'games', 'moon', 'colony']);
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
  /** fabrication en cours, dans l'ordre, et avancement de la première pièce (secondes de jeu) */
  craft: GearId[];
  craftT: number;
  /** chevaux partis avec une troupe (pas sauvegardé : une expédition en route ne l'est pas) */
  riding: number;
  /** combats gagnés par les troupes (embuscades repoussées) */
  wins: number;
  /** derniers imprévus survenus, du plus ancien au plus récent : les prochaines expéditions en tirent d'autres */
  recent: string[];
  /** 1 une fois le volet maritime connu de la partie (les anciennes sauvegardes n'ont pas ce champ : voir `readExpState`) */
  sea: number;
}

/** Imprévus récents dont on se souvient (les deux ou trois dernières expéditions) */
export const RECENT_EVENTS = 6;

export const newExpState = (): ExpState => ({ done: [], perks: [], herd: [], bonus: { food: 0, water: 0, jobs: 0, joy: 0 }, temp: [], clock: 0, gear: emptyStock(), craft: [], craftT: 0, riding: 0, wins: 0, recent: [], sea: 1 });

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
  s.herd = Array.isArray(d.herd) ? d.herd.filter((x: any) => ['sheep', 'cow', 'pig', 'horse'].includes(x)) : [];
  for (const k of Object.keys(s.bonus) as NeedKey[]) s.bonus[k] = +d.bonus?.[k] || 0;
  s.temp = Array.isArray(d.temp) ? d.temp.filter((t: any) => t && t.need in s.bonus && isFinite(t.n) && isFinite(t.until)) : [];
  s.clock = +d.clock || 0;
  for (const k of Object.keys(s.gear) as GearId[]) s.gear[k] = Math.max(0, Math.floor(+d.gear?.[k] || 0));
  s.craft = Array.isArray(d.craft) ? d.craft.filter((x: any) => x in GEAR_BY) : [];
  s.craftT = +d.craftT || 0;
  s.wins = Math.max(0, Math.floor(+d.wins || 0));
  // (les sauvegardes d'avant ne s'en souviennent pas : rien d'évité)
  // (les sauvegardes d'avant le volet maritime : la caravelle, obligatoire au Moyen Âge, ne bloque pas qui a déjà fini les autres
  // obligatoires de cet âge ou ouvert l'âge suivant ; son chantier naval est alors disponible)
  if (!d.sea) {
    const ageOf = (id: string) => MISSIONS.find((m) => m.id === id)?.age ?? 0;
    if (!s.done.includes('caravel') && (['mine', 'dragon'].every((x) => s.done.includes(x)) || s.done.some((x) => ageOf(x) >= 3))) s.done.push('caravel');
  }
  s.recent = Array.isArray(d.recent) ? d.recent.filter((x: any) => typeof x === 'string').slice(-RECENT_EVENTS) : [];
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
const PERK_NAME: Record<string, string> = { seeds: 'blé des collines : champs +30 %', furs: 'peaux de mammouth : des fourrures pour tout le camp', megalodon: 'dents de mégalodon : un trophée sur la place du village', kraken: 'tentacule de kraken : un trophée sur la place du village', dragon: 'le trésor du dragon : sa légende court dans tout le pays', games: 'les Jeux du village : le monde entier connaît son stade', moon: 'le drapeau du village sur la Lune', colony: 'une colonie sur une autre planète' };

PERK_NAME.caravel = 'la caravelle a tenu la mer : le chantier naval est ouvert';
PERK_NAME.spices = 'les épices des îles lointaines garnissent les tables du village';
PERK_NAME.galleon = 'le trésor du galion englouti est au village';
PERK_NAME.portal = 'le portail de l’autre rive est ouvert : tours de garde et caserne sur son île';
PERK_NAME.hellking = 'la couronne du roi des Enfers : un trophée sur la place du village';
PERK_NAME.hellforge = 'la forge infernale : l’équipement se fabrique plus vite, les expéditions sont plus sûres';

/** La dernière expédition, réussie : la fin de la partie (on peut continuer à bâtir) */
export const VICTORY = 'colony';

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
    else if (e.t === 'unherd') out.push(`−${e.n} ${HERD_NAME[e.kind][e.n > 1 ? 1 : 0]}`);
  }
  return out.join(' · ') || 'rien';
}

/** Une intro en deux temps : sa première phrase (ce qu'on affiche) et le reste (replié sous « En savoir plus »). Rien n'est perdu : head + rest = le texte */
export function splitIntro(text: string): { head: string; rest: string } {
  const m = /^.*?[.!?…](?=\s|$)/s.exec(text);
  const head = m ? m[0] : text;
  return { head, rest: text.slice(head.length).trim() };
}
