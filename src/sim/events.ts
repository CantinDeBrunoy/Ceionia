import type { DestKind, Effect, Scene } from './missions';
import type { GearId } from './gear';

/**
 * Décisions en cours d'expédition : une fois sur place (et parfois à mi-chemin du travail), l'équipe tombe sur un imprévu et
 * attend la décision du joueur. Chaque option change le risque, le temps passé, ce que l'on rapporte… et certaines demandent
 * un équipement emporté (une corde, une barque, des armes). Chaque imprévu se joue sur la scène de l'expédition (voir
 * ExpeditionScene) : son texte ne promet que ce qu'on y voit
 */

export interface EventOption {
  label: string;
  /**
   * Option d'attente (attendre, s'abriter, passer son chemin, laisser faire) : l'équipe ne fait rien d'autre. Son temps
   * de travail est un temps d'attente, pendant lequel le travail est suspendu et l'équipe reste à l'arrêt
   */
  wait?: boolean;
  /**
   * Un éclaireur part devant reconnaître le chemin : la troupe s'arrête et l'attend (son temps de travail, comme une attente),
   * on le voit s'avancer dans la galerie puis revenir
   */
  scout?: boolean;
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
  /** cœurs de mission où il peut survenir (sinon tous) : le bélier pour les moutons, le taureau à la pierre à sel… */
  scenes?: Scene[];
  /** missions et cœurs de mission où il n'a pas sa place (pas de loups chez les jongleurs, pas de crue pour une pirogue) */
  not?: string[];
  notScenes?: Scene[];
  /** âges où il peut survenir, du premier au dernier (les loups et les laies ne rôdent plus à l'époque moderne) */
  ages?: [number, number];
  /** il survient en chemin : à l'arrivée de l'équipe seulement, pas au milieu du travail */
  arrive?: boolean;
  /** il survient au cœur du combat : jamais à l'arrivée, et pas avant cette part du travail (le monstre a surgi de l'eau) */
  from?: number;
  /** en pleine mer (requins, houle) ou sur l'eau douce (crocodiles) ; `warm` : seulement sous un climat chaud */
  water?: 'sea' | 'fresh';
  warm?: boolean;
  title: string;
  text: string;
  options: EventOption[];
}

/** Les armes de toutes les époques (la lance au plasma) : une équipe armée, quelle que soit son arme, peut tenir tête */
const WEAPONS: GearId[] = ['spear', 'bow', 'sword', 'crossbow', 'rifle', 'assault', 'grenade', 'plasma'];
const ARMORS: GearId[] = ['armor', 'energyArmor'];
const LIGHTS: GearId[] = ['torch', 'lamp'];
const food = (n: number, days?: number): Effect => ({ t: 'need', need: 'food', n, days });
const joy = (n: number, days?: number): Effect => ({ t: 'need', need: 'joy', n, days });

export const EVENTS: ExpEvent[] = [
  // ---------------- Au cosmodrome : nuages noirs sur le pas de tir, voyant rouge au pied de la fusée ----------------
  {
    id: 'winds', where: ['spaceport'], arrive: true, title: 'Vents violents en altitude',
    text: 'Les ballons-sondes signalent des vents violents là-haut, et de gros nuages noirs roulent vers le cosmodrome.',
    options: [
      { wait: true, label: 'Attendre une fenêtre de beau temps', risk: 0.8, work: 10, text: 'On a attendu que les nuages passent : le ciel était parfait pour voler.' },
      { label: 'Corriger la trajectoire et y aller', risk: 1.1, work: 2, text: 'Les ingénieurs ont corrigé la trajectoire à la volée pour contourner le vent.' },
      { label: 'Passer en force', risk: 1.35, work: -4, text: 'On a foncé dans le vent, toute la fusée secouée.' },
    ],
  },
  {
    id: 'alarm', where: ['spaceport'], arrive: true, title: 'Un voyant rouge',
    text: 'Un voyant rouge clignote au pied de la fusée : une vanne du deuxième étage ne répond plus.',
    options: [
      { label: 'Tout revérifier, pièce par pièce', risk: 0.75, work: 12, text: 'Les ingénieurs ont tout revérifié : ce n’était qu’un capteur fatigué, aussitôt changé.' },
      { label: 'Faire appel aux chercheurs', risk: 0.85, work: 5, bonus: [joy(1)], text: 'Les chercheurs ont trouvé la panne en un clin d’œil.' },
      { label: 'Ignorer l’alarme', risk: 1.35, text: 'On a ignoré l’alarme… en croisant les doigts.' },
    ],
  },
  // ---------------- En chemin : on les croise à l'arrivée ----------------
  {
    id: 'boar', where: ['forest', 'plain'], ages: [0, 3], arrive: true, not: ['motorcar', 'flight'], title: 'Une laie et ses petits',
    text: 'Des grognements dans les fourrés : une laie et ses marcassins barrent le sentier. Elle n’a pas l’air commode.',
    options: [
      { label: 'Faire un grand détour', risk: 0.9, work: 6, text: 'On a laissé la laie tranquille, quitte à marcher davantage.' },
      { label: 'L’effrayer en brandissant les armes', needs: WEAPONS, risk: 0.7, text: 'Armes levées et grands cris : la laie a filé avec ses petits.' },
      { label: 'Passer en silence', risk: 1.25, work: -3, text: 'On est passé sur la pointe des pieds… à deux doigts de la charge.' },
    ],
  },
  {
    id: 'flood', where: ['river'], water: 'fresh', notScenes: ['boat', 'dive'], title: 'La rivière gonfle',
    text: 'Il a plu en amont : l’eau monte à vue d’œil et le courant emporte des branches.',
    options: [
      { wait: true, label: 'Attendre la décrue', risk: 0.85, work: 8, text: 'On a attendu que l’eau baisse, en haut de la berge.' },
      { label: 'Passer en barque', needs: ['boat'], risk: 0.6, text: 'La barque a fendu le courant sans une goutte embarquée.' },
      { label: 'Continuer les pieds dans l’eau', risk: 1.3, work: -4, text: 'On a continué les pieds dans l’eau, de l’eau jusqu’aux genoux.' },
    ],
  },
  {
    id: 'ledge', where: ['mountain'], arrive: true, title: 'Un passage au-dessus du vide',
    text: 'Le sentier se réduit à une corniche étroite, avec le vide d’un côté et des cailloux qui roulent.',
    options: [
      { label: 'S’encorder', needs: ['rope'], risk: 0.55, text: 'Encordés deux par deux, on a franchi la corniche sans frayeur.' },
      { label: 'Contourner par le long chemin', risk: 0.9, work: 8, text: 'On a pris le long chemin des bergers.' },
      { label: 'Avancer prudemment', risk: 1.15, text: 'Pas à pas sur la corniche, le cœur battant.' },
    ],
  },
  {
    id: 'traveler', where: ['plain', 'forest', 'far', 'river', 'mountain'], water: 'fresh', arrive: true, title: 'Un voyageur blessé',
    text: 'Au bord du chemin, un voyageur s’est foulé la cheville. Il est loin de chez lui.',
    options: [
      { label: 'Le soigner', needs: ['kit'], risk: 1, bonus: [joy(2, 5)], text: 'Soigné et reposé, le voyageur a promis de raconter partout l’accueil du village.' },
      { label: 'Le ramener au village', risk: 1, work: 5, bonus: [joy(1, 4)], text: 'On a ramené le voyageur au village, qui l’a fêté comme un des siens.' },
      { wait: true, label: 'Passer son chemin', risk: 1.05, text: 'On a passé son chemin, sans fierté.' },
    ],
  },
  {
    id: 'hosts', where: ['far'], not: ['seeds', 'brewer'], title: 'Un village voisin',
    text: 'Des voisins d’un hameau proche viennent saluer l’équipe, un panier à la main : on vous invite à partager le repas.',
    options: [
      { label: 'Échanger des cadeaux', risk: 0.9, work: 4, bonus: [joy(2, 5)], text: 'Cadeaux échangés, chansons partagées : de nouveaux amis.' },
      { label: 'Remercier et reprendre la route', risk: 1, text: 'On a remercié nos hôtes avant de reprendre la route.' },
    ],
  },
  // ---------------- Les dents de l'eau : le requin au large, le crocodile des eaux douces chaudes ----------------
  {
    id: 'shark', where: ['river'], water: 'sea', scenes: ['boat', 'dive', 'voyage', 'wreck', 'trawl'], title: 'Un aileron dans l’eau',
    text: 'Un grand aileron gris fend l’eau et tourne autour du bateau : un requin !',
    options: [
      { label: 'Fuir vers la rive', risk: 0.9, work: 6, text: 'On a mis le cap sur la rive à toute vitesse, l’aileron sur les talons.' },
      { label: 'Se battre, armes en main', needs: WEAPONS, risk: 0.6, text: 'Un bon coup bien placé sur le museau : le requin a filé dans les profondeurs.' },
      { label: 'Jeter des appâts', risk: 0.8, work: 3, text: 'On a jeté des poissons au loin : le requin s’est rué dessus, et on a pu continuer.' },
    ],
  },
  {
    id: 'croc', where: ['river'], water: 'fresh', warm: true, scenes: ['boat', 'fish', 'gather', 'pebbles', 'hops', 'salt', 'spring'], title: 'Un crocodile !',
    text: 'Ce que l’on prenait pour un tronc flottant ouvre un œil, puis une gueule pleine de dents : un crocodile glisse vers l’équipe.',
    options: [
      { label: 'Fuir loin de l’eau', risk: 0.9, work: 5, text: 'On a couru loin de la berge : le crocodile a claqué des mâchoires dans le vide.' },
      { label: 'Se battre, armes en main', needs: WEAPONS, risk: 0.65, text: 'Les armes pointées l’ont fait reculer : le crocodile a replongé dans l’eau brune.' },
      { label: 'Lui jeter de la viande', risk: 0.8, work: 3, text: 'Un morceau de viande lancé au loin : le crocodile l’a avalé d’un coup, et on l’a laissé digérer.' },
    ],
  },
  // ---------------- La chasse au monstre des mers ----------------
  {
    id: 'swell', where: ['river'], scenes: ['megalodon', 'kraken'], title: 'La tempête se lève',
    text: 'Le ciel noircit au large, la pluie fouette la mer et de grosses vagues secouent la galère : les hommes d’armes se cramponnent aux bords, harpons à la main.',
    options: [
      { label: 'Ramer face aux vagues', risk: 0.85, work: 4, text: 'Tous aux rames, face aux vagues : la galère a tenu bon dans la tempête.' },
      { wait: true, label: 'Attendre que la mer se calme', risk: 0.9, work: 6, text: 'On a attendu que la tempête passe, à l’abri derrière les boucliers.' },
      { label: 'Foncer quand même', risk: 1.25, work: -3, text: 'On a foncé dans les vagues, trempés jusqu’aux os.' },
    ],
  },
  {
    // le kraken creuse la mer : un tourbillon tourne autour de la galère
    id: 'maelstrom', where: ['river'], scenes: ['kraken'], from: 0.5, title: 'Un tourbillon se creuse',
    text: 'La mer se met à tourner autour du kraken : un immense tourbillon d’écume aspire la galère vers son cœur.',
    options: [
      { label: 'Ramer hors du tourbillon', risk: 0.85, work: 5, text: 'Tous aux rames : la galère s’est arrachée au tourbillon.' },
      { label: 'Harponner le kraken au cœur du tourbillon', needs: WEAPONS, risk: 1.1, work: -4, bonus: [{ t: 'ore', n: 2 }], text: 'Au cœur du tourbillon, les harpons ont frappé le kraken de tout près.' },
      { wait: true, label: 'Jeter l’ancre et attendre qu’il se referme', risk: 0.9, work: 6, text: 'L’ancre jetée, on a attendu que le tourbillon se referme.' },
    ],
  },
  {
    // le mégalodon fonce sur la galère, gueule ouverte
    id: 'lunge', where: ['river'], scenes: ['megalodon'], title: 'Le mégalodon fonce sur la galère',
    text: 'L’aileron plonge, puis la gueule géante jaillit droit sur la galère !',
    options: [
      { label: 'Virer de bord à toutes rames', risk: 0.9, work: 4, text: 'Un coup de barre, et la gueule s’est refermée sur le vide.' },
      { label: 'Le recevoir, harpons pointés', needs: WEAPONS, risk: 0.8, text: 'Les harpons pointés l’ont reçu de plein fouet : il a reculé, en sang.' },
      { label: 'Lui jeter un quartier de viande', risk: 0.95, work: 2, text: 'Le quartier de viande l’a détourné un instant.' },
    ],
  },
  {
    // en chemin vers le large seulement : pendant le combat, on n'a pas le temps de fouiller une épave
    id: 'wreck', where: ['river'], scenes: ['megalodon', 'kraken'], arrive: true, title: 'Une épave flotte',
    text: 'Les restes d’un bateau dérivent sur l’eau, rongés et brisés : le monstre est passé par là.',
    options: [
      { label: 'Fouiller l’épave', risk: 1.1, work: 5, bonus: [{ t: 'ore', n: 2 }], text: 'Dans l’épave, des lingots de métal : un petit trésor.' },
      { label: 'Charger les harpons', needs: WEAPONS, risk: 0.75, work: 3, text: 'Les harpons chargés et prêts, on a avancé, l’œil sur l’eau.' },
      { label: 'Passer sans s’arrêter', risk: 0.95, text: 'On est passé en silence, sans quitter l’eau des yeux.' },
    ],
  },
  // ---------------- Le volet maritime : épave à la dérive, grain en plein voyage ----------------
  {
    id: 'derelict', where: ['river'], scenes: ['voyage', 'wreck', 'trawl'], arrive: true, water: 'sea', ages: [2, 5], title: 'Une coque à la dérive',
    text: 'Une coque abandonnée dérive sur l’eau, mâts brisés et voiles en lambeaux : un navire perdu dans une tempête, il y a longtemps.',
    options: [
      { label: 'L’accoster et fouiller la cale', risk: 1.1, work: 5, bonus: [{ t: 'ore', n: 3 }], text: 'Dans la cale, des barres de métal et un coffre scellé : un petit trésor.' },
      { label: 'Relever son nom pour les cartes', risk: 0.85, work: 3, bonus: [joy(1, 4)], text: 'On a noté son nom et sa position sur la carte : les marins s’en souviendront.' },
      { label: 'Passer au large', risk: 0.95, text: 'On a gardé ses distances, par superstition.' },
    ],
  },
  {
    id: 'squall', where: ['river'], scenes: ['voyage', 'wreck', 'trawl'], water: 'sea', from: 0.4, title: 'Un grain se lève',
    text: 'Le ciel se couvre d’un coup : la pluie tombe en rideau, le vent se lève et les vagues grossissent autour du bateau.',
    options: [
      { label: 'Réduire la toile et tenir le cap', risk: 0.85, work: 4, text: 'Voile réduite, barre bien tenue : le bateau a traversé le grain sans une avarie.' },
      { wait: true, label: 'Se mettre à la cape', risk: 0.9, work: 6, text: 'On s’est mis à la cape, face aux vagues, en attendant que le grain passe.' },
      { label: 'Forcer l’allure pour le devancer', risk: 1.25, work: -3, text: 'On a forcé l’allure : trempés, mais on a distancé le grain.' },
    ],
  },
  // ---------------- Le dragon dans sa grotte ----------------
  {
    id: 'bones', where: ['cave'], scenes: ['dragon'], arrive: true, title: 'Des ossements devant la grotte',
    text: 'Des os rongés et des boucliers fondus jonchent l’entrée de la grotte : d’autres sont venus avant vous…',
    options: [
      { label: 'Fouiller les boucliers fondus', risk: 1.05, work: 4, bonus: [{ t: 'ore', n: 2 }], text: 'Sous les os, du bon métal à refondre.' },
      { label: 'Serrer les rangs, boucliers levés', needs: ARMORS, risk: 0.8, work: 2, text: 'Boucliers levés, rangs serrés : la troupe est entrée sans trembler.' },
      { label: 'Avancer sans un regard', risk: 1, text: 'On a enjambé les os sans un mot.' },
    ],
  },
  {
    id: 'flames', where: ['cave'], scenes: ['dragon'], title: 'Le dragon crache le feu',
    text: 'Le dragon gonfle sa poitrine : un torrent de flammes jaillit de sa gueule et balaie l’entrée de la grotte !',
    options: [
      { label: 'Lever les boucliers', needs: ARMORS, risk: 0.75, work: 2, text: 'Les flammes ont léché les boucliers sans les percer.' },
      { label: 'Se jeter derrière les rochers', risk: 0.85, work: 4, text: 'Tout le monde s’est jeté derrière les rochers : le feu est passé au-dessus des têtes.' },
      { label: 'Charger à travers les flammes', risk: 1.3, work: -4, text: 'On a chargé à travers les flammes, les barbes roussies.' },
    ],
  },
  // ---------------- La traversée vers l'île du portail ----------------
  {
    id: 'crossing', where: ['river'], scenes: ['portal'], arrive: true, title: 'La houle du bras de mer',
    text: 'À mi-chemin de l’île, le vent forcit : de longues vagues soulèvent la galère et la poussent de travers.',
    options: [
      { label: 'Ramer en cadence, face aux vagues', risk: 0.85, work: 4, text: 'Tous aux rames, en cadence : la galère a tenu son cap jusqu’à la plage.' },
      { wait: true, label: 'Attendre que le vent tombe', risk: 0.9, work: 6, text: 'On a laissé passer le coup de vent avant de reprendre la traversée.' },
      { label: 'Hisser la voile et filer', risk: 1.2, work: -4, text: 'Voile hissée, la galère a filé vers l’île en embarquant des paquets de mer.' },
    ],
  },
  {
    id: 'runes', where: ['river'], scenes: ['portal'], arrive: true, title: 'Des runes sur la plage',
    text: 'Sur les rochers de la plage, des signes inconnus sont gravés dans la pierre noire, et ils luisent doucement.',
    options: [
      { label: 'Recopier les runes avant de monter', risk: 0.8, work: 5, text: 'Les runes recopiées ont guidé l’équipe : elle savait où poser les mains sur l’arche.' },
      { label: 'Les éclairer à la torche', needs: LIGHTS, risk: 0.7, work: 2, text: 'À la lueur des torches, les runes ont montré le chemin jusqu’à l’arche.' },
      { label: 'Monter tout droit à l’arche', risk: 1.1, work: -3, text: 'On a filé droit sur l’arche, sans s’attarder sur ces drôles de signes.' },
    ],
  },
  {
    id: 'rumble', where: ['river'], scenes: ['portal'], from: 0.4, title: 'L’arche gronde',
    text: 'Un grondement sourd monte de l’arche ; des étincelles rouges jaillissent entre ses pierres et les braseros crachent des flammes.',
    options: [
      { label: 'Reculer et laisser l’arche s’apaiser', wait: true, risk: 0.85, work: 6, text: 'On a reculé le temps que l’arche s’apaise, puis on s’est remis à l’ouvrage.' },
      { label: 'Lever les boucliers et continuer', needs: ARMORS, risk: 0.75, work: 2, text: 'Derrière les boucliers, l’équipe a continué malgré la pluie d’étincelles.' },
      { label: 'Finir au plus vite', risk: 1.25, work: -4, text: 'On a fini en hâte, les étincelles plein les cheveux.' },
    ],
  },
  // ---------------- Les grands Jeux du village ----------------
  {
    id: 'flame', where: ['plain'], scenes: ['games'], arrive: true, title: 'La flamme vacille',
    text: 'Le vent se lève sur la dernière ligne droite : la flamme du relais vacille au bout de la torche.',
    options: [
      { label: 'La rallumer à la lanterne de secours', risk: 0.85, work: 3, text: 'La lanterne de secours a rallumé la flamme : le relais a repris de plus belle.' },
      { label: 'Courir plus vite', risk: 1.15, work: -3, bonus: [{ t: 'need', need: 'joy', n: 1, days: 4 }], text: 'Le porteur a couru à perdre haleine : la flamme est arrivée, toute petite, sous les vivats.' },
    ],
  },
  {
    id: 'record', where: ['plain'], scenes: ['games'], title: 'Un record en vue',
    text: 'Sur la piste, une coureuse du village file plus vite que personne avant elle : le record est à portée !',
    options: [
      { label: 'Encourager à tue-tête', risk: 0.9, work: 2, bonus: [{ t: 'need', need: 'joy', n: 2, days: 6 }], text: 'Tout le stade a crié son nom : record battu !' },
      { label: 'Faire silence pour l’athlète', risk: 0.95, work: 3, text: 'Le stade a retenu son souffle : la coureuse a fini en tête.' },
    ],
  },
  // ---------------- Le temps qu'il fait : l'orage et le brouillard sur la scène ----------------
  {
    id: 'storm', where: ['plain', 'far', 'mountain'], not: ['stars'], title: 'L’orage menace',
    text: 'Un gros nuage noir s’arrête au-dessus de l’équipe, les éclairs zèbrent le ciel et la pluie se met à tomber.',
    options: [
      { wait: true, label: 'S’abriter et attendre', risk: 0.85, work: 7, text: 'On a attendu la fin de l’orage, serrés les uns contre les autres.' },
      { label: 'Continuer sous la pluie', risk: 1.2, work: -3, text: 'Trempés jusqu’aux os, on a continué coûte que coûte.' },
    ],
  },
  {
    id: 'fog', where: ['plain', 'forest', 'mountain', 'far'], title: 'Le brouillard tombe',
    text: 'En quelques minutes, un brouillard épais avale le paysage : on n’y voit plus à dix pas.',
    options: [
      { wait: true, label: 'Attendre qu’il se lève', risk: 0.9, work: 6, text: 'On a attendu que le brouillard se lève, emmitouflés.' },
      { label: 'Avancer à l’aveugle', risk: 1.2, work: -3, text: 'On a avancé à l’aveugle, en se tenant par l’épaule.' },
    ],
  },
  // ---------------- Les loups : on les voit tourner autour de l'équipe ----------------
  {
    id: 'wolves', where: ['forest', 'plain', 'far'], ages: [0, 3], not: ['fair', 'brewer', 'motorcar', 'flight', 'railway'], notScenes: ['hunt'], title: 'Des loups rôdent',
    text: 'Des silhouettes grises tournent autour de l’équipe : une meute, qui garde ses distances… pour l’instant.',
    options: [
      { label: 'Monter la garde, armes en main', needs: WEAPONS, risk: 0.6, text: 'Les veilleurs armés ont tenu la meute à distance, et elle a fini par filer.' },
      { label: 'Allumer un grand feu', risk: 0.85, work: 3, text: 'Un grand feu bien nourri : les loups n’ont pas osé approcher.' },
      { label: 'Plier bagage sur-le-champ', risk: 1.2, work: -4, text: 'On a plié bagage en vitesse, les loups sur les talons.' },
    ],
  },
  {
    id: 'pack', where: ['forest'], missions: ['wolf'], scenes: ['hunt'], title: 'Les traces du loup',
    text: 'Les traces sont fraîches, et deux autres loups sortent du bois : le loup n’est pas seul, toute la meute est là.',
    options: [
      { label: 'Les traquer armes à la main', needs: WEAPONS, risk: 0.65, text: 'Armes au poing, on a acculé la meute au fond du vallon.' },
      { label: 'Poser des pièges', needs: ['rope'], risk: 0.8, work: 5, text: 'Les pièges de corde ont fait le reste.' },
      { label: 'Suivre les traces sans bruit', risk: 1.15, text: 'On a suivi la meute, à pas de loup.' },
    ],
  },
  // ---------------- Les bêtes à ramener : le meneur du troupeau, propre à chaque bête ----------------
  {
    id: 'stallion', where: ['plain', 'far'], missions: ['horses'], title: 'L’étalon de la harde',
    text: 'Un grand étalon fougueux veille sur les juments et s’interpose dès qu’on approche.',
    options: [
      { label: 'L’amadouer patiemment', risk: 0.8, work: 6, text: 'Des heures de patience : l’étalon s’est laissé caresser l’encolure.' },
      { label: 'Le capturer au lasso', needs: ['rope'], risk: 0.75, bonus: [{ t: 'herd', kinds: ['horse'] }], text: 'Un lasso bien lancé : l’étalon a suivi, et la harde avec lui.' },
      { wait: true, label: 'Le laisser filer', risk: 1, work: -2, text: 'On a laissé partir l’étalon pour ne pas affoler la harde.' },
    ],
  },
  {
    id: 'ram', where: ['plain'], missions: ['herd'], scenes: ['herd'], title: 'Le bélier de tête',
    text: 'Un vieux bélier aux cornes enroulées mène le troupeau, et baisse la tête dès qu’on approche.',
    options: [
      { label: 'Lui tendre une poignée d’herbe', risk: 0.8, work: 6, text: 'Une poignée d’herbe tendre, et le vieux bélier s’est laissé gratter le front.' },
      { label: 'Le mener à la corde', needs: ['rope'], risk: 0.75, bonus: [{ t: 'herd', kinds: ['sheep'] }], text: 'Une corde au cou, le bélier a suivi… et tout le troupeau derrière lui.' },
      { wait: true, label: 'Le laisser filer', risk: 1, work: -2, text: 'On a laissé partir le bélier, et le troupeau s’est un peu dispersé.' },
    ],
  },
  {
    id: 'lamb', where: ['plain'], missions: ['herd'], scenes: ['herd'], title: 'Un agneau dans les ronces',
    text: 'Un agneau s’est pris dans un buisson de ronces et bêle à fendre l’âme ; sa mère tourne autour, affolée.',
    options: [
      { label: 'Le libérer doucement', risk: 0.85, work: 4, bonus: [{ t: 'herd', kinds: ['sheep'] }], text: 'Libéré des ronces, l’agneau ne nous a plus quittés.' },
      { wait: true, label: 'Laisser la mère s’en charger', risk: 1, text: 'La brebis a fini par tirer son petit des ronces.' },
    ],
  },
  {
    id: 'tusker', where: ['forest'], missions: ['herd'], scenes: ['corral'], title: 'Le vieux sanglier',
    text: 'Un vieux sanglier aux défenses jaunes gratte le sol et fonce sur les branchages de l’enclos.',
    options: [
      { label: 'Renforcer l’enclos', risk: 0.8, work: 6, text: 'On a doublé les branchages : le vieux sanglier s’y est cassé le groin.' },
      { label: 'Le repousser, armes en main', needs: WEAPONS, risk: 0.7, text: 'Armes pointées, on a repoussé le vieux sanglier dans les fourrés.' },
      { label: 'Lui ouvrir l’enclos', risk: 1.15, work: -3, text: 'On a laissé sortir le vieux sanglier… et deux bêtes avec lui.' },
    ],
  },
  {
    id: 'bull', where: ['river'], missions: ['herd'], scenes: ['salt'], title: 'Le grand taureau',
    text: 'Un aurochs énorme, cornes en avant, gratte le sol près de la pierre à sel et souffle bruyamment.',
    options: [
      { wait: true, label: 'Rester cachés jusqu’à ce qu’il se calme', risk: 0.8, work: 6, text: 'Cachés derrière les buissons, on a attendu que le grand taureau se calme.' },
      { label: 'Le mener à la corde', needs: ['rope'], risk: 0.8, bonus: [{ t: 'herd', kinds: ['cow'] }], text: 'Une corde aux cornes : le grand taureau a suivi, doux comme un agneau.' },
      { label: 'Le chasser à grands cris', risk: 1.2, work: -3, text: 'Le taureau a détalé à nos cris… et les vaches l’ont suivi un moment.' },
    ],
  },
  // ---------------- La chasse au mammouth : le vieux mâle qui charge, la tempête de neige où la harde disparaît ----------------
  {
    id: 'tusks', where: ['plain', 'mountain', 'far'], missions: ['mammoth'], title: 'Le vieux mâle charge',
    text: 'Le plus vieux mammouth de la harde a flairé les chasseurs : il lève la trompe, barrit à faire trembler le sol… et fonce droit sur eux !',
    options: [
      { label: 'Se jeter derrière les rochers', risk: 0.8, work: 5, text: 'Tout le monde s’est jeté derrière les rochers : le vieux mâle est passé en trombe, sans toucher personne.' },
      { label: 'Serrer les rangs, armes pointées', risk: 0.85, text: 'Serrés en hérisson, armes pointées : le vieux mâle a pilé net, puis fait demi-tour en grondant.' },
      { label: 'Tenir bon en criant plus fort que lui', risk: 1.25, work: -3, text: 'On a tenu bon en criant à pleins poumons : le vieux mâle a fait demi-tour… à deux pas des chasseurs.' },
    ],
  },
  {
    id: 'blizzard', where: ['plain', 'mountain', 'far'], missions: ['mammoth'], title: 'Une tempête de neige',
    text: 'Le vent du nord se lève et la neige tombe à gros flocons : on ne voit plus la harde, et ses traces s’effacent.',
    options: [
      { wait: true, label: 'Se serrer sous les peaux autour du feu', risk: 0.85, work: 7, text: 'Serrés sous les peaux autour du feu, on a laissé passer la tempête.' },
      { label: 'Suivre les traces avant qu’elles s’effacent', risk: 1.15, work: -3, text: 'On a suivi les grandes traces dans la neige fraîche : la harde n’était pas loin.' },
    ],
  },
  // ---------------- Au bord de l'eau ----------------
  {
    id: 'shoal', where: ['river'], missions: ['fishing', 'reef'], title: 'Un banc de poissons',
    text: 'L’eau frémit : un grand banc de poissons remonte le courant juste devant l’équipe !',
    options: [
      { label: 'Lancer les filets', risk: 1.05, work: 5, bonus: [food(2, 4)], text: 'Les filets sont revenus pleins à craquer.' },
      { wait: true, label: 'Ne pas se disperser', risk: 0.95, text: 'On a laissé passer le banc pour rester à l’ouvrage.' },
    ],
  },
  {
    id: 'rapids', where: ['river'], water: 'fresh', scenes: ['boat'], title: 'Les rapides',
    text: 'Le courant forcit : devant la barque, l’eau écume entre les rochers.',
    options: [
      { label: 'Porter la barque le long de la berge', risk: 0.8, work: 6, text: 'On a porté la barque sur la berge le temps de passer les rapides.' },
      { wait: true, label: 'Attendre que l’eau se calme', risk: 0.9, work: 5, text: 'On a attendu, amarrés, que l’eau se calme.' },
      { label: 'Sauter les rapides', risk: 1.3, work: -4, text: 'On a sauté les rapides, cramponnés aux bords.' },
    ],
  },
  {
    id: 'deer', where: ['mountain', 'river'], missions: ['springs'], title: 'Des cerfs à la source',
    text: 'Une petite harde de cerfs descend boire à l’eau chaude, sans se soucier de l’équipe.',
    options: [
      { wait: true, label: 'Les regarder en silence', risk: 1, bonus: [joy(1, 4)], text: 'On a regardé les cerfs boire, sans faire un bruit : un moment magique.' },
      { label: 'Les chasser pour la viande', needs: WEAPONS, risk: 1.05, bonus: [food(2, 4)], text: 'Une chasse rapide : de la viande pour le retour.' },
      { label: 'Les faire fuir', risk: 0.95, text: 'Un grand cri, et les cerfs ont détalé dans la montagne.' },
    ],
  },
  // ---------------- La montagne : les pierres qui roulent, ce qui brille dans la roche ----------------
  {
    id: 'scree', where: ['mountain'], scenes: ['mine', 'pass', 'summit'], title: 'Des pierres dévalent la pente',
    text: 'Un grondement sourd : des pierres se détachent de la paroi et dévalent la pente, juste à côté de l’équipe.',
    options: [
      { wait: true, label: 'S’abriter sous un surplomb', risk: 0.75, work: 7, text: 'Serrés sous un surplomb, on a laissé passer les pierres.' },
      { label: 'S’encorder et continuer', needs: ['rope'], risk: 0.8, text: 'Encordés, on a continué sous la paroi.' },
      { label: 'Foncer avant que ça tombe', risk: 1.3, work: -4, text: 'On a foncé, un œil sur la pente.' },
    ],
  },
  {
    id: 'vein', where: ['mountain', 'cave'], scenes: ['mine', 'pass', 'gallery', 'cave', 'drill'], title: 'Un éclat dans la roche',
    text: 'Au détour d’un rocher, quelque chose brille dans la paroi.',
    options: [
      { label: 'Creuser un peu', risk: 1.1, work: 7, bonus: [{ t: 'ore', n: 2 }], text: 'On a creusé : une belle veine de minerai.' },
      { label: 'Ne pas traîner', risk: 0.95, text: 'On a planté un jalon pour une autre fois.' },
    ],
  },
  // ---------------- Grottes et galeries ----------------
  {
    id: 'rockfall', where: ['mountain', 'cave'], scenes: ['gallery', 'cave', 'drill'], title: 'Ça craque au-dessus',
    text: 'Un grondement sourd, et des pierres dégringolent de la paroi au-dessus de l’entrée.',
    options: [
      { label: 'Étayer avant de continuer', risk: 0.75, work: 7, text: 'On a étayé l’entrée avec des poutres avant d’aller plus loin.' },
      { label: 'S’encorder et continuer', needs: ['rope'], risk: 0.8, text: 'Encordés, on a continué sous la paroi.' },
      { label: 'Foncer avant que ça tombe', risk: 1.3, work: -4, text: 'On a foncé, un œil sur le plafond.' },
    ],
  },
  {
    id: 'dark', where: ['cave'], scenes: ['cave'], title: 'Les torches faiblissent',
    text: 'Au fond de la grotte, les torches de fortune crépitent et baissent : bientôt, on n’y verra plus rien.',
    options: [
      { label: 'Allumer les bonnes torches', needs: LIGHTS, risk: 0.6, text: 'À la lueur des bonnes torches, les parois scintillaient.' },
      { label: 'Suivre le courant d’air', risk: 1.1, bonus: [{ t: 'ore', n: 1 }], text: 'On a suivi le courant d’air… jusqu’à une veine inconnue.' },
      { label: 'Ressortir refaire des torches', risk: 0.9, work: 6, text: 'On est ressorti refaire des torches pour mieux repartir.' },
    ],
  },
  {
    id: 'bats', where: ['cave'], scenes: ['cave', 'dragon'], title: 'Une nuée de chauves-souris',
    text: 'Un grand battement d’ailes : des centaines de chauves-souris jaillissent de la grotte !',
    options: [
      { wait: true, label: 'Se plaquer au sol', risk: 0.85, work: 3, text: 'À plat ventre, on a laissé passer la nuée.' },
      { label: 'Agiter les torches', needs: LIGHTS, risk: 0.75, text: 'Les torches agitées ont écarté les chauves-souris.' },
      { label: 'Foncer à travers', risk: 1.2, work: -3, text: 'On a foncé à travers la nuée, les bras devant les yeux.' },
    ],
  },
  {
    id: 'firedamp', where: ['cave'], missions: ['coal'], scenes: ['cave'], title: 'Ça sent le grisou',
    text: 'Une odeur d’œuf pourri sort de la grotte avec une fumée verdâtre : du gaz, prêt à s’enflammer à la moindre flamme.',
    options: [
      { label: 'Éteindre les lampes et aérer', risk: 0.7, work: 8, text: 'Lampes éteintes, on a aéré la grotte avant d’y retourner.' },
      { label: 'Descendre le canari en cage', risk: 0.85, work: 4, text: 'Le canari chantait toujours : on a pu continuer.' },
      { label: 'Avancer en retenant son souffle', risk: 1.25, text: 'On a avancé en retenant son souffle…' },
    ],
  },
  {
    id: 'seep', where: ['mountain'], scenes: ['gallery'], title: 'L’eau envahit la galerie',
    text: 'Une source a percé la paroi : l’eau ruisselle hors de la galerie et fait une grande flaque à l’entrée.',
    options: [
      { label: 'Écoper au seau, chacun son tour', risk: 0.85, work: 6, text: 'On a écopé au seau, chacun son tour, jusqu’à la dernière flaque.' },
      { label: 'Creuser une rigole', risk: 0.8, work: 8, text: 'Une rigole bien creusée a emmené l’eau loin de la galerie.' },
      { label: 'Travailler les pieds dans l’eau', risk: 1.2, text: 'On a travaillé les pieds dans l’eau, en grelottant.' },
    ],
  },
  // ---------------- Propres à une mission ----------------
  {
    id: 'birds', where: ['forest', 'river'], missions: ['berries'], title: 'Les oiseaux arrivent',
    text: 'Une nuée d’étourneaux s’abat sur les buissons : ils picorent les plus belles baies !',
    options: [
      { label: 'Les chasser à grands gestes', risk: 0.9, work: 3, text: 'De grands gestes et des cris : les étourneaux sont allés picorer ailleurs.' },
      { label: 'Cueillir plus vite qu’eux', risk: 1.1, work: -3, text: 'On a cueilli à toute vitesse, les oiseaux tout autour.' },
      { wait: true, label: 'Leur laisser un buisson', risk: 0.95, work: 2, bonus: [joy(1, 3)], text: 'On a laissé un buisson aux oiseaux, qui nous ont chanté merci.' },
    ],
  },
  {
    id: 'swarm', where: ['forest', 'plain'], missions: ['honey'], title: 'L’essaim se réveille',
    text: 'Un bourdonnement monte : les abeilles sortent par centaines et tournent autour de l’équipe.',
    options: [
      { label: 'Plus de fumée !', risk: 0.75, work: 4, text: 'Une épaisse fumée a rendormi l’essaim.' },
      { wait: true, label: 'Reculer et attendre', risk: 0.9, work: 6, text: 'On a reculé sans un geste, le temps que l’essaim se calme.' },
      { label: 'Prendre le rayon tout de suite', risk: 1.3, work: -4, bonus: [food(1, 3)], text: 'On a pris le rayon tout de suite… et quelques piqûres avec.' },
    ],
  },
  {
    id: 'wheel', where: ['far'], missions: ['fair'], title: 'Une roue cassée',
    text: 'La roulotte des jongleurs a perdu une roue dans une ornière : elle penche dangereusement.',
    options: [
      { label: 'Aider à la réparer', risk: 0.9, work: 6, bonus: [joy(1, 5)], text: 'Tout le monde a mis la main à la roue : les jongleurs nous ont remerciés en chansons.' },
      { label: 'Porter les bagages à dos d’homme', risk: 1, work: 3, text: 'On a porté les malles des jongleurs à dos d’homme.' },
      { wait: true, label: 'Laisser les jongleurs se débrouiller', risk: 1.15, work: -3, text: 'On a laissé les jongleurs réparer seuls leur roulotte.' },
    ],
  },
  {
    id: 'tasting', where: ['far'], missions: ['brewer'], scenes: ['abbey'], title: 'La dégustation',
    text: 'Le frère sort trois chopes et lève la sienne : « Goûtez-les toutes, et dites-moi laquelle est la meilleure ! »',
    options: [
      { label: 'Goûter les trois', risk: 1.05, work: 4, bonus: [joy(1, 5)], text: 'On a goûté les trois bières, en chantant un peu fort.' },
      { label: 'Une gorgée, pas plus', risk: 0.95, text: 'Une gorgée de chaque, pas plus : le frère a apprécié notre sérieux.' },
      { label: 'Demander la recette par écrit', risk: 0.9, work: 6, text: 'Le frère a recopié sa recette de sa plus belle plume.' },
    ],
  },
  {
    id: 'puncture', where: ['plain'], missions: ['motorcar'], title: 'Un pneu crevé',
    text: 'Pssshhh… La voiture s’arrête dans un nuage de fumée, une roue à plat.',
    options: [
      { label: 'Changer la roue avec soin', risk: 0.8, work: 6, text: 'Roue changée, boulons serrés : la voiture est repartie comme neuve.' },
      { label: 'Une rustine vite faite', risk: 1, work: 2, text: 'Une rustine vite faite, et en route.' },
      { label: 'Repartir sur la jante', risk: 1.3, work: -2, text: 'On est reparti sur la jante, dans un fracas d’étincelles.' },
    ],
  },
  {
    id: 'gust', where: ['plain', 'mountain'], missions: ['flight'], title: 'Un coup de vent',
    text: 'Une rafale secoue la montgolfière : l’enveloppe se creuse et la nacelle tangue.',
    options: [
      { label: 'Tenir bon et chauffer', risk: 0.85, work: 3, text: 'Brûleur à fond, on a tenu bon jusqu’à ce que le vent tombe.' },
      { wait: true, label: 'Attendre que le vent tombe', risk: 0.8, work: 7, text: 'On a attendu que le vent tombe avant d’aller plus loin.' },
      { label: 'Se laisser porter', risk: 1.25, work: -3, text: 'On s’est laissé porter par la rafale, en se cramponnant.' },
    ],
  },
  {
    id: 'clouds', where: ['mountain', 'far'], missions: ['stars'], title: 'Les nuages cachent le ciel',
    text: 'Une couche de nuages gris glisse au-dessus de l’équipe et cache le ciel.',
    options: [
      { wait: true, label: 'Attendre une éclaircie', risk: 0.9, work: 8, text: 'On a attendu l’éclaircie : le ciel s’est rouvert d’un coup.' },
      { label: 'Observer quand même', risk: 1.1, work: -2, text: 'On a observé entre deux nuages.' },
    ],
  },
  {
    id: 'cows', where: ['plain'], missions: ['railway'], scenes: ['rails'], title: 'Des vaches sur le tracé',
    text: 'Des vaches broutent en plein sur le tracé de la voie, et ne comptent pas bouger.',
    options: [
      { wait: true, label: 'Attendre qu’elles passent', risk: 0.9, work: 5, text: 'On a attendu que les vaches finissent leur repas.' },
      { label: 'Les mener plus loin', risk: 0.95, work: 2, text: 'On a mené les vaches un peu plus loin, dans un meilleur pré.' },
      { label: 'Faire siffler la locomotive', risk: 1.1, work: -2, bonus: [joy(1, 3)], text: 'Un coup de sifflet : les vaches ont détalé, et tout le chantier a ri.' },
    ],
  },
];

export const EVENT_BY: Record<string, ExpEvent> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Où en est l'équipe quand l'imprévu survient : sa destination, sa mission, ce qu'elle y fait, l'âge, et si elle arrive */
export interface EventCtx { dest: DestKind; mission: string; scene: Scene; age: number; arrive: boolean; /** au large (la mer) ; climat chaud */ sea?: boolean; warm?: boolean; /** part du travail où il tombe (pendant le travail) */ at?: number }

/** Imprévus qui peuvent survenir à cette équipe, à ce moment-là (sans tenir compte de ceux déjà vus) */
export function eventsFor(ctx: EventCtx): ExpEvent[] {
  return EVENTS.filter((e) => e.where.includes(ctx.dest)
    && (!e.missions || e.missions.includes(ctx.mission)) && (!e.scenes || e.scenes.includes(ctx.scene))
    && !e.not?.includes(ctx.mission) && !e.notScenes?.includes(ctx.scene)
    && (!e.ages || (ctx.age >= e.ages[0] && ctx.age <= e.ages[1])) && (!e.arrive || ctx.arrive)
    && (e.from === undefined || (!ctx.arrive && (ctx.at ?? 1) >= e.from))
    && (!e.water || (e.water === 'sea') === !!ctx.sea) && (!e.warm || !!ctx.warm));
}

/**
 * Imprévu pour une équipe : de préférence propre à sa mission (ou à ce qu'elle fait), jamais deux fois le même dans une
 * expédition (`seen`), et autant que possible pas un de ceux des dernières expéditions ni des autres équipes en route
 * (`avoid`) ; null s'il n'y en a pas
 */
export function pickEvent(ctx: EventCtx, seen: string[], avoid: string[], rnd: () => number): ExpEvent | null {
  const ok = eventsFor(ctx).filter((e) => !seen.includes(e.id));
  const fresh = ok.filter((e) => !avoid.includes(e.id)), pool = fresh.length ? fresh : ok;
  const own = pool.filter((e) => e.missions || e.scenes), any = pool.filter((e) => !e.missions && !e.scenes);
  const list = own.length && (rnd() < 0.7 || !any.length) ? own : any;
  return list.length ? list[Math.floor(rnd() * list.length)] : null;
}

/** Combien de secondes de jeu l'équipe attend quand elle choisit cette option d'attente (son temps de travail, de 4 à 12 s) */
export function waitTime(o: EventOption): number {
  return Math.min(12, Math.max(4, o.work ?? 0));
}
