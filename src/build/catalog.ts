export type KindId = 'house' | 'farm' | 'pen' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire'
  | 'stable' | 'apiary' | 'baths' | 'tavern' | 'mine' | 'observatory' | 'outpost' | 'lumber' | 'quarry' | 'station' | 'barber' | 'alpine' | 'police' | 'terminal'
  | 'harbor' | 'airport' | 'stadium' | 'football' | 'basket' | 'tennis' | 'waterpark' | 'funfair' | 'theater' | 'acropolis' | 'forum' | 'senate'
  | 'carworks' | 'lab' | 'aerodrome' | 'manor';

/** Rayons de la barre de construction */
export type BuildCat = 'home' | 'prod' | 'service' | 'life';

export interface KindDef {
  id: KindId;
  size: 1 | 2 | 3;
  minAge: number;
  icon: string;
  /** rayon de la barre de construction */
  cat: BuildCat;
  /** Nom par âge (index 0..4) */
  names: string[];
  desc: string;
  housing?: number[];
  food?: number[];
  water?: number[];
  jobs?: number[];
  joy?: number[];
  health?: number[];
  /** effet particulier, en clair (fiche du bâtiment) */
  perk?: string;
  /** mission d'expédition qu'il faut avoir réussie pour le bâtir */
  reqMission?: string;
}

export const KINDS: Record<KindId, KindDef> = {
  house: {
    id: 'house', size: 1, minAge: 0, icon: '🏠', cat: 'home',
    names: ['Hutte', 'Maison antique', 'Maison à colombages', 'Maison de brique', 'Résidence'],
    desc: 'Loge des habitants. Les maisons accolées fusionnent.',
    housing: [3, 4, 6, 9, 14],
  },
  farm: {
    id: 'farm', size: 1, minAge: 0, icon: '🌾', cat: 'prod',
    names: ['Séchoir à grains', 'Ferme', 'Grange', 'Ferme à silo', 'Serre'],
    desc: 'Nourrit les habitants.',
    food: [6, 9, 13, 20, 30], jobs: [1, 2, 2, 3, 3],
  },
  pen: {
    id: 'pen', size: 2, minAge: 0, icon: '🐑', cat: 'prod',
    names: ['Enclos de branchages', 'Enclos', 'Bergerie', 'Étable', 'Ferme d’élevage'],
    desc: 'Les bêtes ramenées par les expéditions y vivent (six par enclos) : du lait, de la laine et de la viande pour le village.',
    food: [6, 9, 12, 16, 22], jobs: [1, 1, 2, 2, 3],
    perk: 'Débloqué par l’expédition « Apprivoiser des bêtes ».',
    reqMission: 'herd',
  },
  stable: {
    id: 'stable', size: 2, minAge: 1, icon: '🐎', cat: 'prod',
    names: ['', 'Écurie', 'Écurie', 'Haras', 'Centre équestre'],
    desc: 'Les chevaux ramenés par les expéditions y vivent (quatre par écurie) et s’y font dresser dans le paddock.',
    jobs: [0, 2, 3, 4, 5], joy: [0, 2, 3, 4, 5],
    perk: 'Débloquée par l’expédition « Les chevaux sauvages ». Les équipes partent à cheval : le travail sur place va 25 % plus vite.',
    reqMission: 'horses',
  },
  apiary: {
    id: 'apiary', size: 1, minAge: 0, icon: '🐝', cat: 'prod',
    names: ['Ruches de troncs', 'Ruches d’argile', 'Rucher', 'Rucher', 'Miellerie'],
    desc: 'Du miel et de la cire pour le village ; les abeilles butinent les champs et les jardins voisins.',
    food: [2, 3, 4, 6, 8], joy: [1, 1, 2, 2, 3], jobs: [0, 1, 1, 1, 2],
    perk: 'Débloqué par l’expédition « Le miel sauvage ».',
    reqMission: 'honey',
  },
  mine: {
    id: 'mine', size: 2, minAge: 2, icon: '⛏️', cat: 'prod',
    names: ['', '', 'Mine', 'Mine de charbon', 'Carrière'],
    desc: 'Tire du minerai de la terre, jour après jour.',
    jobs: [0, 0, 3, 6, 8],
    perk: 'Débloquée par l’expédition « Le filon de la montagne ». Ne se creuse que dans la montagne. Rapporte chaque jour du minerai (3 au Moyen Âge, 5 à l’âge industriel, 8 ensuite) et de la pierre.',
    reqMission: 'mine',
  },
  outpost: {
    id: 'outpost', size: 2, minAge: 2, icon: '🚩', cat: 'service',
    names: ['', '', 'Avant-poste', 'Avant-poste fortifié', 'Base avancée'],
    desc: 'Camp retranché devant une grotte ou une faille : les expéditions armées partent d’ici vers les profondeurs, et sa garnison tient les premières galeries.',
    jobs: [0, 0, 3, 4, 5],
    perk: 'Débloqué par l’expédition « Repérer les profondeurs ». À bâtir tout contre une grotte ou une faille. Chaque expédition armée qui revient victorieuse étend les galeries tenues sous terre.',
    reqMission: 'scout',
  },
  station: {
    id: 'station', size: 2, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Petite gare', 'Gare moderne'],
    desc: 'Un arrêt du chemin de fer : les voyageurs y montent et en descendent, les mineurs y prennent le train pour l’avant-poste.',
    jobs: [0, 0, 0, 3, 5], joy: [0, 0, 0, 3, 4],
    perk: 'Choisissez une gare (d’un clic) puis « Nouvelle ligne », et cliquez dans l’ordre les gares et les avant-postes à relier : un train fera la navette entre eux.',
  },
  terminal: {
    id: 'terminal', size: 2, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Grande gare', 'Gare centrale'],
    desc: 'La grande gare du village : les voyageurs y montent et en descendent, les mineurs y prennent le train pour l’avant-poste.',
    jobs: [0, 0, 0, 8, 12], joy: [0, 0, 0, 4, 6],
    perk: 'Choisissez une gare (d’un clic) puis « Nouvelle ligne », et cliquez dans l’ordre les gares et les avant-postes à relier : un train fera la navette entre eux.',
  },
  harbor: {
    id: 'harbor', size: 3, minAge: 2, icon: '⚓', cat: 'prod',
    names: ['', '', 'Port', 'Port de commerce', 'Port à conteneurs'],
    desc: 'Quais, entrepôts et grues : les navires marchands y accostent, déchargent et repartent.',
    jobs: [0, 0, 6, 10, 14], food: [0, 0, 4, 6, 8],
    perk: 'Grande zone portuaire de 3 × 3 à poser au bord de la mer ou d’un lac : il suffit qu’un côté touche l’eau, le quai s’y tourne de lui-même et le bassin devant est creusé pour les grands navires (cogue, vapeur, porte-conteneurs) qui entrent, s’amarrent au quai et repartent au large.',
  },
  airport: {
    id: 'airport', size: 3, minAge: 4, icon: '✈️', cat: 'service',
    names: ['', '', '', '', 'Aéroport'],
    desc: 'Piste, aérogare, tour de contrôle et hangar : les avions décollent et se posent.',
    jobs: [0, 0, 0, 0, 20], joy: [0, 0, 0, 0, 8],
    perk: 'Grand bâtiment de 3 × 3 cases, sur un terrain plat. Un avion roule jusqu’à la piste, décolle, fait un grand tour au-dessus du pays et revient se poser.',
  },
  lumber: {
    id: 'lumber', size: 1, minAge: 0, icon: '🪓', cat: 'prod',
    names: ['Abri de bûcheron', 'Camp de bûcherons', 'Scierie', 'Scierie à vapeur', 'Scierie mécanique'],
    desc: 'Abat et débite le bois de la forêt voisine. À poser en lisière ou dans une forêt.',
    jobs: [1, 2, 2, 3, 3],
    perk: 'Donne du bois chaque jour (4, puis 6, 8, 11, 14 selon l’âge) pour bâtir les grands bâtiments.',
  },
  quarry: {
    id: 'quarry', size: 1, minAge: 0, icon: '🪨', cat: 'prod',
    names: ['Pierrier', 'Carrière', 'Carrière', 'Carrière à treuil', 'Carrière mécanisée'],
    desc: 'Taille la pierre des rochers voisins. À poser près des rochers ou dans la montagne.',
    jobs: [1, 2, 2, 3, 3],
    perk: 'Donne de la pierre chaque jour (3, puis 5, 7, 9, 12 selon l’âge) pour bâtir les grands bâtiments.',
  },
  pier: {
    id: 'pier', size: 1, minAge: 0, icon: '🎣', cat: 'prod',
    names: ['Coin de pêche', 'Ponton de pêche', 'Pêcherie', 'Conserverie', 'Port de pêche'],
    desc: 'Nourrit grâce aux poissons. À poser au bord de l’eau : mer, rivière ou lac.',
    food: [4, 6, 9, 13, 18], jobs: [1, 1, 2, 3, 3],
  },
  well: {
    id: 'well', size: 1, minAge: 0, icon: '💧', cat: 'home',
    names: ['Point d’eau', 'Puits', 'Puits couvert', 'Pompe', 'Fontaine'],
    desc: 'Fournit de l’eau à six maisons environ. Une maison près d’une rivière en a déjà.',
    // un point d'eau pour six maisons environ, à chaque âge (une maison loge 3, 4, 6, 9 puis 14 habitants)
    water: [18, 26, 38, 56, 85],
  },
  workshop: {
    id: 'workshop', size: 2, minAge: 0, icon: '🔨', cat: 'prod',
    names: ['Atelier de pierre', 'Atelier de poterie', 'Forge', 'Usine', 'Bureaux'],
    desc: 'Offre du travail.',
    jobs: [4, 6, 8, 12, 16],
  },
  gather: {
    id: 'gather', size: 1, minAge: 0, icon: '🔥', cat: 'life',
    names: ['Feu de camp', 'Agora', 'Marché', 'Parc', 'Place'],
    desc: 'Lieu de rencontre : augmente le bien-être.',
    joy: [4, 6, 8, 10, 12],
  },
  temple: {
    id: 'temple', size: 2, minAge: 1, icon: '⛪', cat: 'life',
    names: ['Autel', 'Temple', 'Église', 'Cathédrale', 'Centre culturel'],
    desc: 'Lieu de culte : beaucoup de bien-être.',
    joy: [6, 14, 20, 26, 32], jobs: [0, 1, 2, 3, 4],
  },
  mill: {
    id: 'mill', size: 2, minAge: 2, icon: '🌬️', cat: 'prod',
    names: ['', '', 'Moulin', 'Minoterie à vapeur', 'Éolienne'],
    desc: 'Travail et un peu de nourriture.',
    jobs: [0, 0, 7, 14, 18], food: [0, 0, 6, 6, 8],
  },
  landmark: {
    id: 'landmark', size: 2, minAge: 2, icon: '🏰', cat: 'life',
    names: ['', '', 'Château', 'Château', 'Château-musée'],
    desc: 'Grand bâtiment emblématique (2×2) : le château du village, qu’on garde à travers les âges.',
    jobs: [0, 0, 6, 12, 20], joy: [0, 0, 6, 6, 8],
  },
  lamp: {
    id: 'lamp', size: 1, minAge: 0, icon: '💡', cat: 'home',
    names: ['Torche', 'Brasero', 'Lanterne', 'Lampadaire à gaz', 'Lampadaire LED'],
    desc: 'Éclaire la nuit.',
    joy: [0.2, 0.2, 0.2, 0.2, 0.2],
  },
  health: {
    id: 'health', size: 2, minAge: 0, icon: '🏥', cat: 'service',
    names: ['Camp du guérisseur', 'Asclépiéion', 'Hôtel-Dieu', 'Hôpital', 'Centre hospitalier'],
    desc: 'Soigne les habitants : la santé du village grandit avec lui.',
    // un seul lieu de soins suffit à un village ordinaire de son âge (chaque habitant en demande 0,2 passé quinze habitants)
    health: [30, 45, 60, 90, 140], jobs: [1, 2, 3, 6, 10],
    perk: 'Les blessés des expéditions guérissent deux fois plus vite.',
  },
  school: {
    id: 'school', size: 2, minAge: 0, icon: '📚', cat: 'service',
    names: ['Cercle des anciens', 'Académie', 'École du monastère', 'École', 'Université'],
    desc: 'Transmet le savoir aux habitants.',
    joy: [3, 4, 6, 8, 10], jobs: [1, 2, 3, 5, 8],
    perk: 'Les expéditions sont plus sûres (risque −30 %).',
  },
  observatory: {
    id: 'observatory', size: 1, minAge: 4, icon: '🔭', cat: 'service',
    names: ['', '', '', '', 'Observatoire'],
    desc: 'Scrute le ciel ; les nuits d’étoiles filantes, tout le village y monte.',
    joy: [0, 0, 0, 0, 8], jobs: [0, 0, 0, 0, 3],
    perk: 'Débloqué par l’expédition « La pluie d’étoiles ». Les expéditions sont plus sûres (risque −15 %).',
    reqMission: 'stars',
  },
  tavern: {
    id: 'tavern', size: 1, minAge: 2, icon: '🍺', cat: 'life',
    names: ['', '', 'Taverne', 'Brasserie', 'Café'],
    desc: 'On y boit, on y chante et on y refait le monde.',
    joy: [0, 0, 5, 7, 9], jobs: [0, 0, 2, 3, 3],
    perk: 'Débloquée par l’expédition « Le maître brasseur ».',
    reqMission: 'brewer',
  },
  barber: {
    id: 'barber', size: 1, minAge: 1, icon: '💈', cat: 'life',
    names: ['', 'Échoppe du barbier', 'Barbier', 'Salon de barbier', 'Salon de coiffure'],
    desc: 'On s’y fait couper les cheveux et tailler la barbe, et l’on y apprend toutes les nouvelles du village.',
    joy: [0, 2, 3, 4, 5], jobs: [0, 1, 1, 2, 2],
  },
  alpine: {
    id: 'alpine', size: 2, minAge: 3, icon: '🏔️', cat: 'life',
    names: ['', '', '', 'Club alpin', 'Station de montagne'],
    desc: 'Chalet des alpinistes et des skieurs, au pied des sommets.',
    joy: [0, 0, 0, 7, 10], jobs: [0, 0, 0, 2, 4],
    perk: 'Ne se pose que dans la montagne. Des cordées grimpent les parois voisines ; quand la neige tient, des skieurs dévalent les pentes jusqu’au chalet (un télésiège les remonte à l’époque moderne) ; à l’époque moderne, des wingsuits s’élancent du sommet et un parapente tourne au-dessus des pentes.',
  },
  stadium: {
    id: 'stadium', size: 3, minAge: 3, icon: '🏟️', cat: 'life',
    names: ['', '', '', 'Stade', 'Stade d’athlétisme'],
    desc: 'Piste d’athlétisme autour d’une pelouse, sautoirs, tribunes : on y court, on y saute, on y lance.',
    joy: [0, 0, 0, 8, 12], jobs: [0, 0, 0, 1, 2],
  },
  football: {
    id: 'football', size: 2, minAge: 3, icon: '⚽', cat: 'life',
    names: ['', '', '', 'Terrain de football', 'Terrain de football'],
    desc: 'Un match le dimanche, des parties improvisées tous les soirs.',
    joy: [0, 0, 0, 6, 8],
  },
  basket: {
    id: 'basket', size: 1, minAge: 4, icon: '🏀', cat: 'life',
    names: ['', '', '', '', 'Terrain de basket'],
    desc: 'Deux paniers, un terrain de bitume et ses lignes : le rendez-vous des jeunes du quartier.',
    joy: [0, 0, 0, 0, 4],
  },
  tennis: {
    id: 'tennis', size: 1, minAge: 3, icon: '🎾', cat: 'life',
    names: ['', '', '', 'Court de tennis', 'Court de tennis'],
    desc: 'Terre battue à l’âge industriel, court en dur ensuite, filet et grillage.',
    joy: [0, 0, 0, 3, 4],
  },
  waterpark: {
    id: 'waterpark', size: 2, minAge: 4, icon: '🌊', cat: 'life',
    names: ['', '', '', '', 'Parc aquatique'],
    desc: 'Bassins, toboggans géants et rivière à bouées : la fête des beaux jours.',
    joy: [0, 0, 0, 0, 14], jobs: [0, 0, 0, 0, 4],
  },
  funfair: {
    id: 'funfair', size: 3, minAge: 3, icon: '🎡', cat: 'life',
    names: ['', '', '', 'Fête foraine', 'Parc d’attractions'],
    desc: 'Manèges, grande roue, montagnes russes, barbe à papa et lumières le soir.',
    joy: [0, 0, 0, 10, 16], jobs: [0, 0, 0, 3, 6],
  },
  baths: {
    id: 'baths', size: 2, minAge: 1, icon: '♨️', cat: 'life',
    names: ['', 'Thermes', 'Étuves', 'Piscine municipale', 'Centre aquatique'],
    desc: 'On s’y lave, on s’y soigne et on s’y retrouve : les thermes antiques deviennent étuves, puis piscine avec son plongeoir.',
    joy: [0, 6, 8, 10, 13], health: [0, 10, 14, 20, 28], jobs: [0, 2, 2, 3, 5],
    perk: 'Débloqués par l’expédition « Les sources chaudes ».',
    reqMission: 'springs',
  },
  manor: {
    id: 'manor', size: 2, minAge: 2, icon: '🏰', cat: 'home',
    names: ['', '', 'Manoir', 'Hôtel particulier', 'Villa'],
    desc: 'Une grande demeure et son jardin : maîtres, enfants et domestiques y logent nombreux. On l’obtient en améliorant une maison.',
    housing: [0, 0, 16, 24, 34], joy: [0, 0, 2, 3, 4],
  },
  carworks: {
    id: 'carworks', size: 2, minAge: 3, icon: '🚗', cat: 'prod',
    names: ['', '', '', 'Usine automobile', 'Usine automobile'],
    desc: 'Châssis, moteurs et carrosseries : les automobiles sortent de la chaîne, font un tour de piste d’essai et partent sur les routes.',
    jobs: [0, 0, 0, 14, 20],
    perk: 'Avec la course automobile gagnée, les voitures remplacent les charrettes sur les routes (les écuries gardent leurs chevaux pour la cavalerie).',
    reqMission: 'motorcar',
  },
  lab: {
    id: 'lab', size: 1, minAge: 3, icon: '⚗️', cat: 'service',
    names: ['', '', '', 'Laboratoire', 'Centre de recherche'],
    desc: 'Savants, fioles et bobines qui crépitent : on y met au point vaccins et inventions.',
    health: [0, 0, 0, 8, 12], jobs: [0, 0, 0, 4, 6],
  },
  aerodrome: {
    id: 'aerodrome', size: 3, minAge: 3, icon: '🎈', cat: 'life',
    names: ['', '', '', 'Aérodrome', 'Aéro-club'],
    desc: 'Les montgolfières s’élèvent au-dessus du village, le dirigeable largue les amarres pour un grand tour et revient à son mât ; biplan et hangar au bord de la piste d’herbe.',
    joy: [0, 0, 0, 9, 11], jobs: [0, 0, 0, 4, 5],
    reqMission: 'flight',
  },
  theater: {
    id: 'theater', size: 2, minAge: 1, icon: '🎭', cat: 'life',
    names: ['', 'Théâtre antique', 'Théâtre de tréteaux', 'Opéra', 'Salle de spectacle'],
    desc: 'Tragédies, comédies, farces, opéras et concerts : tout le village vient au spectacle.',
    joy: [0, 7, 9, 12, 15], jobs: [0, 2, 2, 4, 5],
  },
  acropolis: {
    id: 'acropolis', size: 3, minAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Acropole', 'Acropole', 'Acropole', 'Acropole'],
    desc: 'La ville haute sur son rocher : le grand temple de marbre, les propylées, le portique des caryatides et la statue d’Athéna veillent sur le village, à travers tous les âges.',
    joy: [0, 12, 12, 14, 16], jobs: [0, 3, 3, 4, 5],
    perk: 'Grand monument de 3 × 3 cases, qu’on garde à travers les âges (comme le château).',
  },
  forum: {
    id: 'forum', size: 2, minAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Forum', 'Halle du marché', 'Halles', 'Marché couvert'],
    desc: 'La grande place où l’on commerce, juge et discute : forum romain, puis halle du marché à charpente, halles de fer et de verre, marché couvert.',
    joy: [0, 8, 8, 9, 10], jobs: [0, 3, 5, 7, 9], food: [0, 0, 2, 3, 4],
  },
  senate: {
    id: 'senate', size: 2, minAge: 1, icon: '🏛️', cat: 'service',
    names: ['', 'Sénat', 'Palais du conseil', 'Palais du Sénat', 'Sénat'],
    desc: 'Les anciens du village y débattent des affaires communes : curie romaine, palais communal et son beffroi, puis palais à coupole.',
    joy: [0, 4, 5, 6, 7], jobs: [0, 4, 5, 7, 9],
  },
  police: {
    id: 'police', size: 2, minAge: 1, icon: '🚓', cat: 'service',
    names: ['', 'Poste des gardes', 'Maison du guet', 'Poste de police', 'Commissariat'],
    desc: 'Veille sur la tranquillité du village, de jour comme de nuit.',
    joy: [0, 2, 3, 4, 5], jobs: [0, 2, 3, 5, 7],
    perk: 'Les rondes rassurent les habitants : un peu de bien-être. À l’âge industriel, le fourgon de la police fait sa tournée ; à l’époque moderne, une voiture de patrouille sillonne les rues, gyrophare allumé.',
  },
  fire: {
    id: 'fire', size: 2, minAge: 0, icon: '🚒', cat: 'service',
    names: ['Guetteurs', 'Poste des vigiles', 'Tour de guet', 'Caserne de pompiers', 'Centre de secours'],
    desc: 'Veille sur les environs.',
    jobs: [1, 2, 3, 5, 7],
    perk: 'Les incendies à 14 cases sont éteints en quelques instants, même loin de l’eau.',
  },
};

export const KIND_ORDER: KindId[] = ['house', 'well', 'lamp', 'farm', 'pen', 'stable', 'apiary', 'pier', 'lumber', 'quarry', 'workshop', 'carworks', 'mine', 'outpost', 'harbor', 'mill', 'health', 'school', 'fire', 'police', 'lab', 'observatory', 'airport', 'aerodrome', 'senate', 'gather', 'forum', 'tavern', 'barber', 'baths', 'theater', 'tennis', 'basket', 'football', 'stadium', 'waterpark', 'funfair', 'alpine', 'temple', 'acropolis', 'landmark', 'station', 'terminal'];

export const BUILD_CATS: { id: BuildCat; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Habitat' },
  { id: 'prod', icon: '🌾', label: 'Production' },
  { id: 'service', icon: '🏥', label: 'Services' },
  { id: 'life', icon: '🎭', label: 'Vie & culture' },
];

export interface AgeDef {
  name: string;
  tagline: string;
  /** Prérequis pour ATTEINDRE cet âge */
  reqPop: number;
  reqKinds: Partial<Record<KindId, number>>;
  /** minerai tiré du monde souterrain */
  reqOre?: number;
}

export const AGES: AgeDef[] = [
  { name: 'Préhistoire', tagline: 'Feux de camp et huttes', reqPop: 0, reqKinds: {} },
  { name: 'Antiquité', tagline: 'Maisons de tuiles, temples et agoras', reqPop: 12, reqKinds: { house: 4, farm: 1, well: 1, workshop: 1 } },
  { name: 'Médiéval', tagline: 'Colombages, églises et châteaux', reqPop: 30, reqKinds: { house: 8, temple: 1, workshop: 2, gather: 1 } },
  { name: 'Industriel', tagline: 'Briques, cheminées et gares', reqPop: 60, reqKinds: { house: 12, temple: 1, mill: 1, landmark: 1, gather: 2, health: 1 }, reqOre: 12 },
  { name: 'Moderne', tagline: 'Tours, éoliennes et parcs', reqPop: 110, reqKinds: { house: 18, mill: 2, landmark: 1, gather: 3, farm: 2, school: 1 }, reqOre: 30 },
];

export const KIND_LABEL: Record<KindId, string> = {
  house: 'maisons', farm: 'fermes', pen: 'enclos', pier: 'pontons de pêche', well: 'puits', workshop: 'ateliers', gather: 'lieux de rencontre',
  temple: 'lieux de culte', mill: 'moulins/usines', landmark: 'bâtiments majeurs', lamp: 'lampadaires',
  health: 'lieux de soins', school: 'écoles', fire: 'casernes',
  stable: 'écuries', apiary: 'ruchers', baths: 'thermes et piscines', tavern: 'tavernes', mine: 'mines', observatory: 'observatoires', outpost: 'avant-postes', lumber: 'bûcherons', quarry: 'carrières', station: 'gares',
  barber: 'coiffeurs', alpine: 'clubs alpins', police: 'commissariats', terminal: 'gares centrales',
  theater: 'théâtres', acropolis: 'acropoles', forum: 'forums et marchés', senate: 'sénats',
  harbor: 'ports', airport: 'aéroports', stadium: 'stades', football: 'terrains de football', basket: 'terrains de basket', tennis: 'courts de tennis', waterpark: 'parcs aquatiques', funfair: 'parcs d’attractions',
  carworks: 'usines automobiles', lab: 'laboratoires', aerodrome: 'aérodromes', manor: 'manoirs',
};

/**
 * Améliorations proposées sur la fiche d'un bâtiment : il devient un autre, plus grand ou plus riche, sur place (son emprise
 * s'étend au besoin sur les cases libres derrière lui), contre le prix du nouveau bâtiment
 */
export const UPGRADES: { from: KindId; to: KindId }[] = [
  { from: 'house', to: 'manor' },
  { from: 'station', to: 'terminal' },
  { from: 'football', to: 'stadium' },
  { from: 'pier', to: 'harbor' },
  { from: 'gather', to: 'forum' },
  { from: 'workshop', to: 'carworks' },
];

export interface Building {
  id: number;
  kind: KindId;
  /** Cellule minimale (coin) de l'empreinte */
  x: number;
  z: number;
  rot: number; // 0..3
  /** Orientation automatique vers la route */
  auto: boolean;
  /** Âge du modèle actuellement affiché */
  age: number;
  /** resté en 1 × 1 (ancienne partie, pas la place de grandir) : il grandira s'il en trouve, ou si on le déplace */
  small?: boolean;
}

/** Côté de l'emprise d'un bâtiment posé */
/** Emprise d'un bâtiment : celle de son genre, une case de moins s'il est resté à l'ancienne taille (`small`) */
export const sizeOf = (b: Building) => (b.small ? KINDS[b.kind].size - 1 : KINDS[b.kind].size) as 1 | 2 | 3;

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
