export type KindId = 'house' | 'farm' | 'pen' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire'
  | 'stable' | 'apiary' | 'baths' | 'tavern' | 'mine' | 'observatory' | 'outpost' | 'lumber' | 'quarry' | 'station' | 'barber' | 'alpine' | 'police' | 'terminal'
  | 'harbor' | 'airport' | 'heliport' | 'watertower' | 'stadium' | 'football' | 'basket' | 'tennis' | 'waterpark' | 'funfair' | 'theater' | 'acropolis' | 'forum' | 'senate'
  | 'carworks' | 'lab' | 'aerodrome' | 'manor'
  | 'arcology' | 'vfarm' | 'fusion' | 'spaceport' | 'research' | 'maglev';

/** Rayons de la barre de construction */
export type BuildCat = 'home' | 'prod' | 'service' | 'life';

export interface KindDef {
  id: KindId;
  size: 1 | 2 | 3 | 4;
  minAge: number;
  icon: string;
  /** rayon de la barre de construction */
  cat: BuildCat;
  /** Nom par âge (index 0..5) */
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
    names: ['Hutte', 'Maison antique', 'Maison à colombages', 'Maison de brique', 'Résidence', 'Tour d’habitation'],
    desc: 'Loge des habitants. Les maisons accolées fusionnent.',
    housing: [3, 4, 6, 9, 14, 20],
  },
  farm: {
    id: 'farm', size: 1, minAge: 0, icon: '🌾', cat: 'prod',
    names: ['Séchoir à grains', 'Ferme', 'Grange', 'Ferme à silo', 'Serre', 'Ferme hydroponique'],
    desc: 'Nourrit les habitants.',
    food: [6, 9, 13, 20, 30, 42], jobs: [1, 2, 2, 3, 3, 3],
  },
  pen: {
    id: 'pen', size: 2, minAge: 0, icon: '🐑', cat: 'prod',
    names: ['Enclos de branchages', 'Enclos', 'Bergerie', 'Étable', 'Ferme d’élevage', 'Éco-élevage'],
    desc: 'Les bêtes ramenées par les expéditions y vivent (six par enclos) : du lait, de la laine et de la viande pour le village.',
    food: [6, 9, 12, 16, 22, 28], jobs: [1, 1, 2, 2, 3, 3],
    perk: 'Débloqué par l’expédition « Apprivoiser des bêtes ».',
    reqMission: 'herd',
  },
  stable: {
    id: 'stable', size: 2, minAge: 1, icon: '🐎', cat: 'prod',
    names: ['', 'Écurie', 'Écurie', 'Haras', 'Centre équestre', 'Centre équestre'],
    desc: 'Les chevaux ramenés par les expéditions y vivent (quatre par écurie) et s’y font dresser dans le paddock.',
    jobs: [0, 2, 3, 4, 5, 6], joy: [0, 2, 3, 4, 5, 6],
    perk: 'Débloquée par l’expédition « Les chevaux sauvages ». Les équipes partent à cheval : le travail sur place va 25 % plus vite.',
    reqMission: 'horses',
  },
  apiary: {
    id: 'apiary', size: 1, minAge: 0, icon: '🐝', cat: 'prod',
    names: ['Ruches de troncs', 'Ruches d’argile', 'Rucher', 'Rucher', 'Miellerie', 'Rucher connecté'],
    desc: 'Du miel et de la cire pour le village ; les abeilles butinent les champs et les jardins voisins.',
    food: [2, 3, 4, 6, 8, 10], joy: [1, 1, 2, 2, 3, 3], jobs: [0, 1, 1, 1, 2, 2],
    perk: 'Débloqué par l’expédition « Le miel sauvage ».',
    reqMission: 'honey',
  },
  mine: {
    id: 'mine', size: 2, minAge: 2, icon: '⛏️', cat: 'prod',
    names: ['', '', 'Mine', 'Mine de charbon', 'Carrière', 'Mine robotisée'],
    desc: 'Tire du minerai de la terre, jour après jour.',
    jobs: [0, 0, 3, 6, 8, 8],
    perk: 'Débloquée par l’expédition « Le filon de la montagne ». Ne se creuse que dans la montagne. Rapporte chaque jour du minerai (3 au Moyen Âge, 5 à l’âge industriel, 8 à l’époque moderne, 10 ensuite) et de la pierre.',
    reqMission: 'mine',
  },
  outpost: {
    id: 'outpost', size: 2, minAge: 2, icon: '🚩', cat: 'service',
    names: ['', '', 'Avant-poste', 'Avant-poste fortifié', 'Base avancée', 'Base souterraine'],
    desc: 'Camp retranché devant une grotte ou une faille : les expéditions armées partent d’ici vers les profondeurs, et sa garnison tient les premières galeries.',
    jobs: [0, 0, 3, 4, 5, 6],
    perk: 'Débloqué par l’expédition « Repérer les profondeurs ». À bâtir tout contre une grotte ou une faille. Chaque expédition armée qui revient victorieuse étend les galeries tenues sous terre.',
    reqMission: 'scout',
  },
  station: {
    id: 'station', size: 2, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Petite gare', 'Gare moderne', 'Gare à grande vitesse'],
    desc: 'Un arrêt du chemin de fer : les voyageurs y montent et en descendent, les mineurs y prennent le train pour l’avant-poste.',
    jobs: [0, 0, 0, 3, 5, 6], joy: [0, 0, 0, 3, 4, 5],
    perk: 'Choisissez une gare (d’un clic) puis « Nouvelle ligne », et cliquez dans l’ordre les gares et les avant-postes à relier : un train fera la navette entre eux.',
  },
  terminal: {
    id: 'terminal', size: 2, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Grande gare', 'Gare centrale', 'Gare intermodale'],
    desc: 'La grande gare du village : les voyageurs y montent et en descendent, les mineurs y prennent le train pour l’avant-poste.',
    jobs: [0, 0, 0, 8, 12, 14], joy: [0, 0, 0, 4, 6, 7],
    perk: 'Choisissez une gare (d’un clic) puis « Nouvelle ligne », et cliquez dans l’ordre les gares et les avant-postes à relier : un train fera la navette entre eux.',
  },
  harbor: {
    id: 'harbor', size: 3, minAge: 2, icon: '⚓', cat: 'prod',
    names: ['', '', 'Port', 'Port de commerce', 'Port à conteneurs', 'Port automatisé'],
    desc: 'Quais, entrepôts et grues : les navires marchands y accostent, déchargent et repartent.',
    jobs: [0, 0, 6, 10, 14, 16], food: [0, 0, 4, 6, 8, 10],
    perk: 'Grande zone portuaire de 3 × 3 à poser au bord de la mer ou d’un lac : il suffit qu’un côté touche l’eau, le quai s’y tourne de lui-même et le bassin devant est creusé pour les grands navires (cogue, vapeur, porte-conteneurs) qui entrent, s’amarrent au quai et repartent au large.',
  },
  airport: {
    id: 'airport', size: 4, minAge: 4, icon: '✈️', cat: 'service',
    names: ['', '', '', '', 'Aéroport', 'Aéroport hypersonique'],
    desc: 'Piste, aérogare et ses passerelles, tour de contrôle, hangar, radar : les avions décollent et se posent.',
    jobs: [0, 0, 0, 0, 24, 28], joy: [0, 0, 0, 0, 10, 12],
    perk: 'Très grand bâtiment de 4 × 4 cases, sur un terrain plat. Un avion quitte son poste, roule par les voies jusqu’au seuil, décolle, fait un grand tour au-dessus du pays, revient dans l’axe, se pose et regagne son poste ; un long-courrier attend à la passerelle.',
  },
  heliport: {
    id: 'heliport', size: 2, minAge: 4, icon: '🚁', cat: 'service',
    names: ['', '', '', '', 'Héliport', 'Droneport'],
    desc: 'Deux aires d’atterrissage balisées, hangar, salon des passagers et sa terrasse : les hélicoptères emmènent les visiteurs survoler le pays.',
    jobs: [0, 0, 0, 0, 8, 9], joy: [0, 0, 0, 0, 6, 7],
    perk: 'Bâtiment de 2 × 2 cases. Deux hélicoptères aux couleurs de l’héliport attendent sur leur aire, lancent leur rotor, décollent, emmènent leurs passagers faire le tour du pays, s’y tiennent en vol stationnaire au-dessus des curiosités, reviennent et se posent ; feux de balisage la nuit.',
  },
  lumber: {
    id: 'lumber', size: 1, minAge: 0, icon: '🪓', cat: 'prod',
    names: ['Abri de bûcheron', 'Camp de bûcherons', 'Scierie', 'Scierie à vapeur', 'Scierie mécanique', 'Scierie robotisée'],
    desc: 'Abat et débite le bois de la forêt voisine. À poser en lisière ou dans une forêt.',
    jobs: [1, 2, 2, 3, 3, 3],
    perk: 'Donne du bois chaque jour (4, puis 6, 8, 11, 14, 17 selon l’âge) pour bâtir les grands bâtiments.',
  },
  quarry: {
    id: 'quarry', size: 1, minAge: 0, icon: '🪨', cat: 'prod',
    names: ['Pierrier', 'Carrière', 'Carrière', 'Carrière à treuil', 'Carrière mécanisée', 'Carrière robotisée'],
    desc: 'Taille la pierre des rochers voisins. À poser près des rochers ou dans la montagne.',
    jobs: [1, 2, 2, 3, 3, 3],
    perk: 'Donne de la pierre chaque jour (3, puis 5, 7, 9, 12, 15 selon l’âge) pour bâtir les grands bâtiments.',
  },
  pier: {
    id: 'pier', size: 1, minAge: 0, icon: '🎣', cat: 'prod',
    names: ['Coin de pêche', 'Ponton de pêche', 'Pêcherie', 'Conserverie', 'Port de pêche', 'Aquaferme'],
    desc: 'Nourrit grâce aux poissons. À poser au bord de l’eau : mer, rivière ou lac.',
    food: [4, 6, 9, 13, 18, 24], jobs: [1, 1, 2, 3, 3, 3],
  },
  well: {
    id: 'well', size: 1, minAge: 0, icon: '💧', cat: 'home',
    names: ['Point d’eau', 'Puits', 'Puits couvert', 'Pompe', 'Fontaine', 'Capteur de brume'],
    desc: 'Fournit de l’eau à six maisons environ. Une maison près d’une rivière en a déjà.',
    // un point d'eau pour six maisons environ, à chaque âge (une maison loge 3, 4, 6, 9 puis 14 habitants)
    water: [18, 26, 38, 56, 85, 130],
  },
  watertower: {
    id: 'watertower', size: 1, minAge: 3, icon: '🗼', cat: 'home',
    names: ['', '', '', 'Château d’eau', 'Château d’eau', 'Réservoir suspendu'],
    desc: 'La réserve d’eau du quartier, perchée en hauteur : elle alimente trois fois plus de maisons qu’un puits.',
    water: [0, 0, 0, 170, 260, 390],
    perk: 'Amélioration du puits (sur sa fiche) ou à bâtir dès l’âge industriel : cuve d’acier rivetée sur sa tour de brique, puis château d’eau de béton en corolle.',
  },
  workshop: {
    id: 'workshop', size: 2, minAge: 0, icon: '🔨', cat: 'prod',
    names: ['Atelier de pierre', 'Atelier de poterie', 'Forge', 'Usine', 'Bureaux', 'Tour de bureaux'],
    desc: 'Offre du travail.',
    jobs: [4, 6, 8, 12, 16, 22],
  },
  gather: {
    id: 'gather', size: 1, minAge: 0, icon: '🔥', cat: 'life',
    names: ['Feu de camp', 'Agora', 'Marché', 'Parc', 'Place', 'Agora holographique'],
    desc: 'Lieu de rencontre : augmente le bien-être.',
    joy: [4, 6, 8, 10, 12, 15],
  },
  temple: {
    id: 'temple', size: 2, minAge: 1, icon: '⛪', cat: 'life',
    names: ['Autel', 'Temple', 'Église', 'Cathédrale', 'Centre culturel', 'Dôme des arts'],
    desc: 'Lieu de culte : beaucoup de bien-être.',
    joy: [6, 14, 20, 26, 32, 40], jobs: [0, 1, 2, 3, 4, 5],
  },
  mill: {
    id: 'mill', size: 2, minAge: 2, icon: '🌬️', cat: 'prod',
    names: ['', '', 'Moulin', 'Minoterie à vapeur', 'Éolienne', 'Éolienne géante'],
    desc: 'Travail et un peu de nourriture.',
    jobs: [0, 0, 7, 14, 18, 20], food: [0, 0, 6, 6, 8, 10],
  },
  landmark: {
    id: 'landmark', size: 2, minAge: 2, icon: '🏰', cat: 'life',
    names: ['', '', 'Château', 'Château', 'Château-musée', 'Musée du château'],
    desc: 'Grand bâtiment emblématique (2×2) : le château du village, qu’on garde à travers les âges.',
    jobs: [0, 0, 6, 12, 20, 24], joy: [0, 0, 6, 6, 8, 10],
  },
  lamp: {
    id: 'lamp', size: 1, minAge: 0, icon: '💡', cat: 'home',
    names: ['Torche', 'Brasero', 'Lanterne', 'Lampadaire à gaz', 'Lampadaire LED', 'Luminaire holographique'],
    desc: 'Éclaire la nuit.',
    joy: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
  },
  health: {
    id: 'health', size: 2, minAge: 0, icon: '🏥', cat: 'service',
    names: ['Camp du guérisseur', 'Asclépiéion', 'Hôtel-Dieu', 'Hôpital', 'Centre hospitalier', 'Clinique du futur'],
    desc: 'Soigne les habitants : la santé du village grandit avec lui.',
    // un seul lieu de soins suffit à un village ordinaire de son âge (chaque habitant en demande 0,2 passé quinze habitants)
    health: [30, 45, 60, 90, 140, 210], jobs: [1, 2, 3, 6, 10, 14],
    perk: 'Les blessés des expéditions guérissent deux fois plus vite.',
  },
  school: {
    id: 'school', size: 2, minAge: 0, icon: '📚', cat: 'service',
    names: ['Cercle des anciens', 'Académie', 'École du monastère', 'École', 'Université', 'Campus numérique'],
    desc: 'Transmet le savoir aux habitants.',
    joy: [3, 4, 6, 8, 10, 12], jobs: [1, 2, 3, 5, 8, 11],
    perk: 'Les expéditions sont plus sûres (risque −30 %).',
  },
  observatory: {
    id: 'observatory', size: 1, minAge: 4, icon: '🔭', cat: 'service',
    names: ['', '', '', '', 'Observatoire', 'Radiotélescope'],
    desc: 'Scrute le ciel ; les nuits d’étoiles filantes, tout le village y monte.',
    joy: [0, 0, 0, 0, 8, 10], jobs: [0, 0, 0, 0, 3, 4],
    perk: 'Débloqué par l’expédition « La pluie d’étoiles ». Les expéditions sont plus sûres (risque −15 %).',
    reqMission: 'stars',
  },
  tavern: {
    id: 'tavern', size: 1, minAge: 2, icon: '🍺', cat: 'life',
    names: ['', '', 'Taverne', 'Brasserie', 'Café', 'Bar à hologrammes'],
    desc: 'On y boit, on y chante et on y refait le monde.',
    joy: [0, 0, 5, 7, 9, 11], jobs: [0, 0, 2, 3, 3, 3],
    perk: 'Débloquée par l’expédition « Le maître brasseur ».',
    reqMission: 'brewer',
  },
  barber: {
    id: 'barber', size: 1, minAge: 1, icon: '💈', cat: 'life',
    names: ['', 'Échoppe du barbier', 'Barbier', 'Salon de barbier', 'Salon de coiffure', 'Salon robotisé'],
    desc: 'On s’y fait couper les cheveux et tailler la barbe, et l’on y apprend toutes les nouvelles du village.',
    joy: [0, 2, 3, 4, 5, 6], jobs: [0, 1, 1, 2, 2, 2],
  },
  alpine: {
    id: 'alpine', size: 2, minAge: 3, icon: '🏔️', cat: 'life',
    names: ['', '', '', 'Club alpin', 'Station de montagne', 'Station d’altitude'],
    desc: 'Chalet des alpinistes et des skieurs, au pied des sommets.',
    joy: [0, 0, 0, 7, 10, 12], jobs: [0, 0, 0, 2, 4, 5],
    perk: 'Ne se pose que dans la montagne. Des cordées grimpent les parois voisines ; quand la neige tient, des skieurs dévalent les pentes jusqu’au chalet (un télésiège les remonte à l’époque moderne) ; à l’époque moderne, des wingsuits s’élancent du sommet et un parapente tourne au-dessus des pentes.',
  },
  stadium: {
    id: 'stadium', size: 3, minAge: 3, icon: '🏟️', cat: 'life',
    names: ['', '', '', 'Stade', 'Stade d’athlétisme', 'Stade à dôme'],
    desc: 'Piste d’athlétisme autour d’une pelouse, sautoirs, tribunes : on y court, on y saute, on y lance.',
    joy: [0, 0, 0, 8, 12, 15], jobs: [0, 0, 0, 1, 2, 3],
  },
  football: {
    id: 'football', size: 2, minAge: 3, icon: '⚽', cat: 'life',
    names: ['', '', '', 'Terrain de football', 'Terrain de football', 'Terrain de football'],
    desc: 'Un match le dimanche, des parties improvisées tous les soirs.',
    joy: [0, 0, 0, 6, 8, 10],
  },
  basket: {
    id: 'basket', size: 1, minAge: 4, icon: '🏀', cat: 'life',
    names: ['', '', '', '', 'Terrain de basket', 'Terrain de basket'],
    desc: 'Deux paniers, un terrain de bitume et ses lignes : le rendez-vous des jeunes du quartier.',
    joy: [0, 0, 0, 0, 4, 5],
  },
  tennis: {
    id: 'tennis', size: 1, minAge: 3, icon: '🎾', cat: 'life',
    names: ['', '', '', 'Court de tennis', 'Court de tennis', 'Court de tennis'],
    desc: 'Terre battue à l’âge industriel, court en dur ensuite, filet et grillage.',
    joy: [0, 0, 0, 3, 4, 5],
  },
  waterpark: {
    id: 'waterpark', size: 2, minAge: 4, icon: '🌊', cat: 'life',
    names: ['', '', '', '', 'Parc aquatique', 'Lagon artificiel'],
    desc: 'Bassins, toboggans géants et rivière à bouées : la fête des beaux jours.',
    joy: [0, 0, 0, 0, 14, 18], jobs: [0, 0, 0, 0, 4, 5],
  },
  funfair: {
    id: 'funfair', size: 3, minAge: 3, icon: '🎡', cat: 'life',
    names: ['', '', '', 'Fête foraine', 'Parc d’attractions', 'Parc virtuel'],
    desc: 'Manèges, grande roue, montagnes russes, barbe à papa et lumières le soir.',
    joy: [0, 0, 0, 10, 16, 20], jobs: [0, 0, 0, 3, 6, 7],
  },
  baths: {
    id: 'baths', size: 2, minAge: 1, icon: '♨️', cat: 'life',
    names: ['', 'Thermes', 'Étuves', 'Piscine municipale', 'Centre aquatique', 'Spa à bulles'],
    desc: 'On s’y lave, on s’y soigne et on s’y retrouve : les thermes antiques deviennent étuves, puis piscine avec son plongeoir.',
    joy: [0, 6, 8, 10, 13, 16], health: [0, 10, 14, 20, 28, 36], jobs: [0, 2, 2, 3, 5, 6],
    perk: 'Débloqués par l’expédition « Les sources chaudes ».',
    reqMission: 'springs',
  },
  manor: {
    id: 'manor', size: 2, minAge: 2, icon: '🏰', cat: 'home',
    names: ['', '', 'Manoir', 'Hôtel particulier', 'Villa', 'Villa bioclimatique'],
    desc: 'Une grande demeure et son jardin : maîtres, enfants et domestiques y logent nombreux. On l’obtient en améliorant une maison.',
    housing: [0, 0, 16, 24, 34, 46], joy: [0, 0, 2, 3, 4, 5],
  },
  carworks: {
    id: 'carworks', size: 2, minAge: 3, icon: '🚗', cat: 'prod',
    names: ['', '', '', 'Usine automobile', 'Usine automobile', 'Usine de voitures volantes'],
    desc: 'Châssis, moteurs et carrosseries : les automobiles sortent de la chaîne, font un tour de piste d’essai et partent sur les routes.',
    jobs: [0, 0, 0, 14, 20, 26],
    perk: 'Avec la course automobile gagnée, les voitures remplacent les charrettes sur les routes (les écuries gardent leurs chevaux pour la cavalerie).',
    reqMission: 'motorcar',
  },
  lab: {
    id: 'lab', size: 1, minAge: 3, icon: '⚗️', cat: 'service',
    names: ['', '', '', 'Laboratoire', 'Centre de recherche', 'Laboratoire de biotech'],
    desc: 'Savants, fioles et bobines qui crépitent : on y met au point vaccins et inventions.',
    health: [0, 0, 0, 8, 12, 16], jobs: [0, 0, 0, 4, 6, 8],
  },
  aerodrome: {
    id: 'aerodrome', size: 3, minAge: 3, icon: '🎈', cat: 'life',
    names: ['', '', '', 'Aérodrome', 'Aéro-club', 'Aéro-club'],
    desc: 'Les montgolfières s’élèvent au-dessus du village, le dirigeable largue les amarres pour un grand tour et revient à son mât ; biplan et hangar au bord de la piste d’herbe.',
    joy: [0, 0, 0, 9, 11, 13], jobs: [0, 0, 0, 4, 5, 6],
    reqMission: 'flight',
  },
  theater: {
    id: 'theater', size: 2, minAge: 1, icon: '🎭', cat: 'life',
    names: ['', 'Théâtre antique', 'Théâtre de tréteaux', 'Opéra', 'Salle de spectacle', 'Salle immersive'],
    desc: 'Tragédies, comédies, farces, opéras et concerts : tout le village vient au spectacle.',
    joy: [0, 7, 9, 12, 15, 18], jobs: [0, 2, 2, 4, 5, 6],
  },
  acropolis: {
    id: 'acropolis', size: 3, minAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Acropole', 'Acropole', 'Acropole', 'Acropole', 'Acropole'],
    desc: 'La ville haute sur son rocher : le grand temple de marbre, les propylées, le portique des caryatides et la statue d’Athéna veillent sur le village, à travers tous les âges.',
    joy: [0, 12, 12, 14, 16, 18], jobs: [0, 3, 3, 4, 5, 6],
    perk: 'Grand monument de 3 × 3 cases, qu’on garde à travers les âges (comme le château).',
  },
  forum: {
    id: 'forum', size: 2, minAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Forum', 'Halle du marché', 'Halles', 'Marché couvert', 'Galerie marchande'],
    desc: 'La grande place où l’on commerce, juge et discute : forum romain, puis halle du marché à charpente, halles de fer et de verre, marché couvert.',
    joy: [0, 8, 8, 9, 10, 12], jobs: [0, 3, 5, 7, 9, 11], food: [0, 0, 2, 3, 4, 5],
  },
  senate: {
    id: 'senate', size: 2, minAge: 1, icon: '🏛️', cat: 'service',
    names: ['', 'Sénat', 'Palais du conseil', 'Palais du Sénat', 'Sénat', 'Sénat'],
    desc: 'Les anciens du village y débattent des affaires communes : curie romaine, palais communal et son beffroi, puis palais à coupole.',
    joy: [0, 4, 5, 6, 7, 8], jobs: [0, 4, 5, 7, 9, 10],
  },
  police: {
    id: 'police', size: 2, minAge: 1, icon: '🚓', cat: 'service',
    names: ['', 'Poste des gardes', 'Maison du guet', 'Poste de police', 'Commissariat', 'Centrale de sécurité'],
    desc: 'Veille sur la tranquillité du village, de jour comme de nuit.',
    joy: [0, 2, 3, 4, 5, 6], jobs: [0, 2, 3, 5, 7, 8],
    perk: 'Les rondes rassurent les habitants : un peu de bien-être. À l’âge industriel, le fourgon de la police fait sa tournée ; à l’époque moderne, une voiture de patrouille sillonne les rues, gyrophare allumé.',
  },
  fire: {
    id: 'fire', size: 2, minAge: 0, icon: '🚒', cat: 'service',
    names: ['Guetteurs', 'Poste des vigiles', 'Tour de guet', 'Caserne de pompiers', 'Centre de secours', 'Base de drones de secours'],
    desc: 'Veille sur les environs.',
    jobs: [1, 2, 3, 5, 7, 8],
    perk: 'Les incendies à 14 cases sont éteints en quelques instants, même loin de l’eau.',
  },
  arcology: {
    id: 'arcology', size: 3, minAge: 5, icon: '🏙️', cat: 'home',
    names: ['', '', '', '', '', 'Arcologie'],
    desc: 'Une ville dans la ville : une immense tour de verre aux courbes blanches sur ses terrasses plantées, jardins suspendus, passerelles, et son anneau de maglev à mi-hauteur.',
    housing: [0, 0, 0, 0, 0, 150], joy: [0, 0, 0, 0, 0, 8], jobs: [0, 0, 0, 0, 0, 12],
    perk: 'Très grand bâtiment de 3 × 3 cases : il loge à lui seul autant qu’un quartier entier, avec ses commerces et ses parcs.',
  },
  vfarm: {
    id: 'vfarm', size: 1, minAge: 5, icon: '🥬', cat: 'prod',
    names: ['', '', '', '', '', 'Ferme verticale'],
    desc: 'Une tour de verre où les cultures montent étage par étage sous les lampes roses ; les drones emportent les récoltes.',
    food: [0, 0, 0, 0, 0, 48], jobs: [0, 0, 0, 0, 0, 4],
    perk: 'Amélioration de la ferme (sur sa fiche) ou à bâtir dès l’âge futuriste.',
  },
  fusion: {
    id: 'fusion', size: 3, minAge: 5, icon: '⚛️', cat: 'prod',
    names: ['', '', '', '', '', 'Centrale à fusion'],
    desc: 'Le soleil en bouteille : un anneau de plasma tenu par de grands aimants dans son tokamak, les tours de refroidissement qui fument, les lignes qui partent vers la ville.',
    jobs: [0, 0, 0, 0, 0, 34],
    perk: 'Grand bâtiment de 3 × 3 cases. Son énergie propulsera le vaisseau de l’expédition finale, « Coloniser une autre planète ».',
  },
  spaceport: {
    id: 'spaceport', size: 4, minAge: 5, icon: '🚀', cat: 'service',
    names: ['', '', '', '', '', 'Cosmodrome'],
    desc: 'Pas de tir et sa tour de lancement, hall d’assemblage où attend la prochaine fusée, centre de contrôle et ses antennes : la porte des étoiles du village.',
    jobs: [0, 0, 0, 0, 0, 30], joy: [0, 0, 0, 0, 0, 12],
    perk: 'Très grand bâtiment de 4 × 4 cases, sur un terrain plat. C’est d’ici que partent les expéditions spatiales : le premier vol de fusée, un homme sur la Lune, puis la colonisation d’une autre planète.',
  },
  research: {
    id: 'research', size: 2, minAge: 5, icon: '🧪', cat: 'service',
    names: ['', '', '', '', '', 'Institut de recherche'],
    desc: 'Un anneau blanc autour d’une sphère de verre où brille l’ordinateur quantique ; les chercheurs y préparent les grandes expéditions.',
    jobs: [0, 0, 0, 0, 0, 14], joy: [0, 0, 0, 0, 0, 4], health: [0, 0, 0, 0, 0, 10],
    perk: 'Les expéditions sont plus sûres (risque −20 %).',
  },
  maglev: {
    id: 'maglev', size: 2, minAge: 5, icon: '🚄', cat: 'service',
    names: ['', '', '', '', '', 'Gare maglev'],
    desc: 'Une rame à sustentation magnétique file sans un bruit sur son anneau suspendu, au-dessus du quai de verre.',
    jobs: [0, 0, 0, 0, 0, 8], joy: [0, 0, 0, 0, 0, 9],
  },
};

export const KIND_ORDER: KindId[] = ['house', 'arcology', 'well', 'watertower', 'lamp', 'farm', 'vfarm', 'pen', 'stable', 'apiary', 'pier', 'lumber', 'quarry', 'workshop', 'carworks', 'mine', 'outpost', 'harbor', 'mill', 'fusion', 'health', 'school', 'fire', 'police', 'lab', 'research', 'observatory', 'airport', 'heliport', 'spaceport', 'aerodrome', 'senate', 'gather', 'forum', 'tavern', 'barber', 'baths', 'theater', 'tennis', 'basket', 'football', 'stadium', 'waterpark', 'funfair', 'alpine', 'temple', 'acropolis', 'landmark', 'station', 'terminal', 'maglev'];

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
  { name: 'Futuriste', tagline: 'Arcologies, maglev et fusées', reqPop: 180, reqKinds: { house: 24, workshop: 3, school: 2, lab: 1, health: 1, gather: 4 }, reqOre: 50 },
];

/**
 * Les bâtiments venus sans valeur pour les derniers âges (ajoutés avant eux) gardent celles de l'âge précédent : nom, places,
 * vivres, eau, travail, bien-être et soins
 */
for (const d of Object.values(KINDS)) {
  for (const f of ['names', 'housing', 'food', 'water', 'jobs', 'joy', 'health'] as const) {
    const a = d[f] as unknown[] | undefined;
    while (a && a.length < AGES.length) a.push(a[a.length - 1]);
  }
}

export const KIND_LABEL: Record<KindId, string> = {
  house: 'maisons', farm: 'fermes', pen: 'enclos', pier: 'pontons de pêche', well: 'puits', workshop: 'ateliers', gather: 'lieux de rencontre',
  temple: 'lieux de culte', mill: 'moulins/usines', landmark: 'bâtiments majeurs', lamp: 'lampadaires',
  health: 'lieux de soins', school: 'écoles', fire: 'casernes',
  stable: 'écuries', apiary: 'ruchers', baths: 'thermes et piscines', tavern: 'tavernes', mine: 'mines', observatory: 'observatoires', outpost: 'avant-postes', lumber: 'bûcherons', quarry: 'carrières', station: 'gares',
  barber: 'coiffeurs', alpine: 'clubs alpins', police: 'commissariats', terminal: 'gares centrales',
  theater: 'théâtres', acropolis: 'acropoles', forum: 'forums et marchés', senate: 'sénats',
  harbor: 'ports', airport: 'aéroports', heliport: 'héliports', watertower: 'châteaux d’eau', stadium: 'stades', football: 'terrains de football', basket: 'terrains de basket', tennis: 'courts de tennis', waterpark: 'parcs aquatiques', funfair: 'parcs d’attractions',
  carworks: 'usines automobiles', lab: 'laboratoires', aerodrome: 'aérodromes', manor: 'manoirs',
  arcology: 'arcologies', vfarm: 'fermes verticales', fusion: 'centrales à fusion', spaceport: 'cosmodromes', research: 'instituts de recherche', maglev: 'gares maglev',
};

/**
 * Améliorations proposées sur la fiche d'un bâtiment : il devient un autre, plus grand ou plus riche, sur place (son emprise
 * s'étend au besoin sur les cases libres derrière lui), contre le prix du nouveau bâtiment
 */
export const UPGRADES: { from: KindId; to: KindId }[] = [
  { from: 'house', to: 'manor' },
  { from: 'well', to: 'watertower' },
  { from: 'station', to: 'terminal' },
  { from: 'football', to: 'stadium' },
  { from: 'pier', to: 'harbor' },
  { from: 'gather', to: 'forum' },
  { from: 'workshop', to: 'carworks' },
  { from: 'farm', to: 'vfarm' },
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
export const sizeOf = (b: Building) => (b.small ? KINDS[b.kind].size - 1 : KINDS[b.kind].size) as 1 | 2 | 3 | 4;

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
