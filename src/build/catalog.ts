export type KindId = 'house' | 'farm' | 'pen' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire'
  | 'stable' | 'apiary' | 'baths' | 'tavern' | 'mine' | 'observatory' | 'lumber' | 'quarry' | 'station' | 'barber' | 'alpine' | 'police' | 'terminal'
  | 'harbor' | 'airport' | 'heliport' | 'watertower' | 'stadium' | 'football' | 'basket' | 'tennis' | 'waterpark' | 'funfair' | 'circus' | 'zoo' | 'theater' | 'acropolis' | 'forum' | 'senate'
  | 'carworks' | 'lab' | 'aerodrome' | 'manor' | 'oilwell' | 'refinery' | 'brickworks'
  | 'arcology' | 'vfarm' | 'fusion' | 'spaceport' | 'research' | 'maglev'
  | 'watchtower' | 'barracks'
  // le volet maritime : chantier naval, phare, halle aux poissons, ferme marine
  | 'shipyard' | 'lighthouse' | 'fishmarket' | 'offshore';

/** Rayons de la barre de construction */
export type BuildCat = 'home' | 'prod' | 'service' | 'life' | 'war';

export interface KindDef {
  id: KindId;
  size: 1 | 2 | 3 | 4;
  minAge: number;
  /** dernier âge où on peut le bâtir : après, tant pis (ceux déjà bâtis restent) */
  maxAge?: number;
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
  /** bâtiment que le village doit déjà avoir pour le bâtir (l'usine automobile veut une raffinerie) */
  reqKind?: KindId;
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
    perk: 'Débloquée par l’expédition « Le filon de la montagne ». Ne se creuse que dans la montagne. Rapporte chaque jour du minerai (6 au Moyen Âge, 10 à l’âge industriel, 16 à l’époque moderne, 20 ensuite), de quoi passer les âges, et de la pierre.',
    reqMission: 'mine',
  },
  oilwell: {
    id: 'oilwell', size: 1, minAge: 3, icon: '🛢️', cat: 'prod',
    names: ['', '', '', 'Puits de pétrole', 'Puits de pétrole', 'Forage automatisé'],
    desc: 'Un chevalet de pompage hoche la tête au-dessus d’un gisement et tire le pétrole brut des profondeurs, jour après jour.',
    jobs: [0, 0, 0, 2, 2, 2],
    perk: 'Ne se fore que sur un gisement de pétrole (les taches sombres où le brut suinte). Rapporte chaque jour du pétrole brut (3 barils à l’âge industriel, 4 ensuite), que la raffinerie change en carburant.',
  },
  refinery: {
    id: 'refinery', size: 3, minAge: 3, icon: '🏭', cat: 'prod',
    names: ['', '', '', 'Raffinerie', 'Raffinerie', 'Raffinerie de synthèse'],
    desc: 'Colonnes de distillation, grands réservoirs, torchère qui flambe et forêt de tuyaux : le pétrole brut des puits y devient du carburant.',
    jobs: [0, 0, 0, 12, 14, 16],
    perk: 'Débloquée par l’expédition « L’or noir ». Grand bâtiment de 3 × 3 cases. Raffine chaque jour jusqu’à 12 barils de pétrole brut, qui donnent 9 de carburant : les automobiles du village roulent avec (il faut une raffinerie pour bâtir l’usine automobile), et à l’époque moderne les blindés de l’expédition armée.',
    reqMission: 'oil',
  },
  brickworks: {
    id: 'brickworks', size: 2, minAge: 3, icon: '🧱', cat: 'prod',
    names: ['', '', '', 'Briqueterie', 'Briqueterie mécanisée', 'Briqueterie automatisée'],
    desc: 'Un four à briques sous sa très haute cheminée qui fume, un séchoir à claire-voie, un tas d’argile et des piles de briques cuites : la ville de brique se fabrique ici.',
    jobs: [0, 0, 0, 6, 8, 8],
    perk: 'Bâtiment de 2 × 2 cases, qui se pose n’importe où. Cuit chaque jour des briques (8 à l’âge industriel, 12 à l’époque moderne, 16 ensuite), dont ont besoin les gares, les usines et les raffineries, et que réclame le passage à l’époque moderne.',
  },
  station: {
    id: 'station', size: 2, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Petite gare', 'Gare moderne', 'Gare à grande vitesse'],
    desc: 'Un arrêt du chemin de fer : les voyageurs y montent et en descendent.',
    jobs: [0, 0, 0, 3, 5, 6], joy: [0, 0, 0, 3, 4, 5],
    reqKind: 'terminal',
    perk: 'On les bâtit une fois la gare centrale au village, pour la prolonger. Choisissez une gare (d’un clic) puis « Nouvelle ligne », et cliquez dans l’ordre les gares à relier : un train fera la navette entre elles. Train de marchandises : briqueterie, mine, carrière, scierie, puits et raffinerie à 8 cases de la gare produisent 75 % de plus. Train de voyageurs : il amène les équipes au cosmodrome voisin.',
  },
  terminal: {
    id: 'terminal', size: 3, minAge: 3, icon: '🚉', cat: 'service',
    names: ['', '', '', 'Gare centrale', 'Gare centrale', 'Gare intermodale'],
    desc: 'La très grande gare du village, toute de brique : façade gothique et sa haute tour de l’horloge sur la rue, et derrière, sous une immense halle de fer et de verre, trois voies où les trains de plusieurs lignes sont à quai ensemble.',
    jobs: [0, 0, 0, 10, 14, 16], joy: [0, 0, 0, 5, 7, 8],
    reqKind: 'brickworks',
    perk: 'Très grand bâtiment de 3 × 3 cases, qui demande des briques : bâtissez d’abord une briqueterie. C’est la première gare du village, avant les petites gares. Ses trois voies partent par l’arrière de la halle : tracez-en plusieurs lignes vers les autres gares (« Nouvelle ligne », sur sa fiche) pour former un réseau. Trains de marchandises : ateliers et carrières à 8 cases d’une gare produisent 75 % de plus. Trains de voyageurs : ils amènent les équipes au cosmodrome.',
  },
  harbor: {
    id: 'harbor', size: 3, minAge: 2, icon: '⚓', cat: 'prod',
    names: ['', '', 'Port', 'Port de commerce', 'Port à conteneurs', 'Port automatisé'],
    desc: 'Quais, entrepôts et grues : les navires marchands y accostent, déchargent et repartent.',
    jobs: [0, 0, 6, 10, 14, 16], food: [0, 0, 4, 6, 8, 10],
    perk: 'Grande zone portuaire de 3 × 3 à poser au bord de la mer ou d’un lac : il suffit qu’un côté touche l’eau, le quai s’y tourne de lui-même et le bassin devant est creusé pour les grands navires (cogue, vapeur, porte-conteneurs) qui entrent, s’amarrent au quai et repartent au large.',
  },
  shipyard: {
    id: 'shipyard', size: 3, minAge: 2, icon: '🚢', cat: 'prod',
    names: ['', '', 'Chantier naval', 'Chantier à vapeur', 'Grand chantier naval', 'Chantier robotisé'],
    desc: 'Sur sa cale, une coque en construction : charpentiers, scie de long et grue ; des navires neufs y sont mis à l’eau.',
    jobs: [0, 0, 6, 9, 12, 14], joy: [0, 0, 1, 1, 2, 2],
    reqMission: 'caravel',
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Débloqué par l’expédition « La caravelle ». Les expéditions en mer sont plus sûres (risque −10 %), et des navires de l’époque (caravelle, vapeur, cargo, navire futuriste) sortent du chantier pour sillonner la mer.',
  },
  lighthouse: {
    id: 'lighthouse', size: 2, minAge: 2, icon: '🗼', cat: 'service',
    names: ['', '', 'Phare', 'Phare à lentille', 'Phare électrique', 'Phare automatisé'],
    desc: 'Une haute tour rayée sur la côte : son feu guide les marins, la nuit, par-dessus les récifs.',
    jobs: [0, 0, 2, 3, 3, 3], joy: [0, 0, 2, 3, 4, 4],
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Son faisceau balaie la mer la nuit ; les expéditions en mer sont plus sûres (risque −12 %).',
  },
  fishmarket: {
    id: 'fishmarket', size: 2, minAge: 2, icon: '🐟', cat: 'prod',
    names: ['', '', 'Halle aux poissons', 'Criée', 'Marché de la mer', 'Marché aquacole'],
    desc: 'Les bateaux y déchargent leur pêche : étals sous la halle, poissons sur la glace, mareyeurs et mouettes.',
    food: [0, 0, 6, 9, 13, 18], jobs: [0, 0, 3, 4, 5, 6], joy: [0, 0, 1, 1, 2, 2],
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Un marché de plus pour nourrir le village avec ce que donne la mer.',
  },
  offshore: {
    id: 'offshore', size: 3, minAge: 4, icon: '🌬️', cat: 'prod',
    names: ['', '', '', '', 'Plateforme offshore', 'Ferme marine'],
    desc: 'Une plateforme sur pilotis : éoliennes, héliplate-forme et cages d’élevage de poissons et d’algues.',
    food: [0, 0, 0, 0, 14, 28], jobs: [0, 0, 0, 0, 8, 12], joy: [0, 0, 0, 0, 1, 3],
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Les poissons et algues d’élevage nourrissent le village ; l’éolienne tourne dans le vent du large.',
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
    perk: 'Bâtiment de 2 × 2 cases. Deux hélicoptères aux couleurs de l’héliport attendent sur leur aire, lancent leur rotor, décollent, emmènent leurs passagers faire le tour du pays, s’y tiennent en vol stationnaire au-dessus des curiosités, reviennent et se posent ; feux de balisage la nuit. Les expéditions de la montagne et du bout du monde partent en hélicoptère : l’équipe monte à bord à l’héliport, vole jusqu’à sa destination, s’y pose, travaille, puis rentre de la même façon.',
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
    names: ['Tailleur de silex', 'Atelier de poterie', 'Forge', 'Usine', 'Bureaux', 'Tour de bureaux'],
    desc: 'Offre du travail.',
    jobs: [4, 6, 8, 12, 16, 22],
  },
  gather: {
    id: 'gather', size: 3, minAge: 0, icon: '🔥', cat: 'life',
    names: ['Feu de camp', 'Agora', 'Marché', 'Parc', 'Place', 'Agora holographique'],
    desc: 'La place du village (3 × 3), son centre : on s’y retrouve de tous côtés, sans porte ni chemin d’accès. Accueille les quatre premiers habitants et augmente le bien-être.',
    joy: [4, 6, 8, 10, 12, 15],
    // les fondateurs : quatre habitants (deux partent en expédition), de quoi manger et boire, de quoi lancer la première expédition
    housing: [4, 4, 4, 4, 4, 4], food: [8, 0, 0, 0, 0, 0], water: [5, 0, 0, 0, 0, 0],
    perk: 'À poser en premier, au cœur du futur village : les maisons, la ferme et le puits viendront autour. On y fête le retour des expéditions.',
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
    id: 'football', size: 3, minAge: 3, icon: '⚽', cat: 'life',
    names: ['', '', '', 'Stade de football', 'Grand stade de football', 'Stade de football futuriste'],
    desc: 'Un match le dimanche, des parties improvisées tous les soirs. Il grandit avec les âges : stade de brique aux gradins de bois, puis grand stade couvert à trois niveaux, puis stade au toit rétractable.',
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
    id: 'waterpark', size: 3, minAge: 4, icon: '🌊', cat: 'life',
    names: ['', '', '', '', 'Parc aquatique', 'Lagon artificiel'],
    desc: 'Tour aux toboggans géants, piscine à vagues, rivière à bouées autour de l’île aux jeux d’eau, vague de surf : la fête des beaux jours.',
    joy: [0, 0, 0, 0, 14, 18], jobs: [0, 0, 0, 0, 4, 5],
  },
  funfair: {
    id: 'funfair', size: 3, minAge: 3, icon: '🎡', cat: 'life',
    names: ['', '', '', 'Fête foraine', 'Parc d’attractions', 'Parc virtuel'],
    desc: 'Manèges, grande roue, montagnes russes, barbe à papa et lumières le soir.',
    joy: [0, 0, 0, 10, 16, 20], jobs: [0, 0, 0, 3, 6, 7],
  },
  circus: {
    id: 'circus', size: 3, minAge: 2, icon: '🎪', cat: 'life',
    names: ['', '', 'Chapiteau de la troupe', 'Cirque', 'Grand cirque', 'Cirque holographique'],
    desc: 'Un grand chapiteau à rayures, des roulottes colorées, une ménagerie rigolote : jongleurs et funambules font rire tout le village.',
    joy: [0, 0, 10, 14, 18, 24], jobs: [0, 0, 2, 3, 4, 5],
    perk: 'Débloqué par l’expédition « Les jongleurs du carrefour ». Grand bâtiment de 3 × 3 cases.',
    reqMission: 'fair',
  },
  zoo: {
    id: 'zoo', size: 3, minAge: 4, icon: '🦒', cat: 'life',
    names: ['', '', '', '', 'Zoo', 'Parc zoologique'],
    desc: 'Éléphant, girafe, ours, crocodile, tortues et lézards dans leurs enclos clôturés, bassins, allées, kiosque et soigneurs : la sortie du dimanche.',
    joy: [0, 0, 0, 0, 12, 16], jobs: [0, 0, 0, 0, 5, 7],
    perk: 'Grand bâtiment de 3 × 3 cases. Les visiteurs flânent d’un enclos à l’autre ; le soigneur nourrit les bêtes.',
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
    desc: 'Châssis, moteurs et carrosseries : les automobiles sortent de la chaîne, font un tour de piste d’essai et partent sur les routes. À l’âge futuriste, les bras robots montent des voitures volantes qui tournent autour du pylône d’essai.',
    jobs: [0, 0, 0, 14, 20, 26],
    perk: 'Avec la course automobile gagnée, et une raffinerie au village, les voitures remplacent les charrettes sur les routes (les écuries gardent leurs chevaux pour la cavalerie). Les voitures roulent au carburant : 2 par jour pour chaque usine ; sans carburant, elles restent au garage.',
    reqMission: 'motorcar',
    reqKind: 'refinery',
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
    perk: 'Sans héliport, les expéditions de la montagne et du bout du monde partent en montgolfière : l’équipe monte dans la nacelle, dérive jusqu’à sa destination, s’y pose, travaille, puis rentre de la même façon (plus lentement qu’en hélicoptère).',
  },
  theater: {
    id: 'theater', size: 2, minAge: 1, icon: '🎭', cat: 'life',
    names: ['', 'Théâtre antique', 'Théâtre de tréteaux', 'Opéra', 'Salle de spectacle', 'Salle immersive'],
    desc: 'Tragédies, comédies, farces, opéras et concerts : tout le village vient au spectacle.',
    joy: [0, 7, 9, 12, 15, 18], jobs: [0, 2, 2, 4, 5, 6],
  },
  acropolis: {
    id: 'acropolis', size: 3, minAge: 1, maxAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Acropole', 'Acropole', 'Acropole', 'Acropole', 'Acropole'],
    desc: 'La ville haute sur son rocher : le grand temple de marbre, les propylées, le portique des caryatides et la statue d’Athéna veillent sur le village, à travers tous les âges.',
    joy: [0, 12, 12, 14, 16, 18], jobs: [0, 3, 3, 4, 5, 6],
    perk: 'Grand monument de 3 × 3 cases, qu’on garde à travers les âges (comme le château).',
  },
  forum: {
    id: 'forum', size: 3, minAge: 1, maxAge: 1, icon: '🏛️', cat: 'life',
    names: ['', 'Forum', 'Halle du marché', 'Halles', 'Marché couvert', 'Galerie marchande'],
    desc: 'La grande place où l’on commerce, juge et discute : forum romain, puis halle du marché à charpente, halles de fer et de verre, marché couvert.',
    joy: [0, 8, 8, 9, 10, 12], jobs: [0, 3, 5, 7, 9, 11], food: [0, 0, 2, 3, 4, 5],
  },
  senate: {
    id: 'senate', size: 2, minAge: 1, maxAge: 1, icon: '🏛️', cat: 'service',
    names: ['', 'Sénat', 'Palais du conseil', 'Palais du Sénat', 'Sénat', 'Sénat'],
    desc: 'Les anciens du village y débattent des affaires communes : curie romaine, palais communal et son beffroi, puis palais à coupole.',
    joy: [0, 4, 5, 6, 7, 8], jobs: [0, 4, 5, 7, 9, 10],
  },
  police: {
    id: 'police', size: 2, minAge: 1, icon: '🚓', cat: 'service',
    names: ['', 'Poste des gardes', 'Maison du guet', 'Poste de police', 'Commissariat', 'Centrale de sécurité'],
    desc: 'Veille sur la tranquillité du village, de jour comme de nuit.',
    joy: [0, 2, 3, 4, 5, 6], jobs: [0, 2, 3, 5, 7, 8],
    perk: 'Les rondes rassurent les habitants : un peu de bien-être. Des gardes escortent les expéditions : risque −5 %, −10 % face aux bêtes sauvages et aux créatures (avec les pompiers, −15 % au plus). À l’âge industriel, le fourgon de la police fait sa tournée ; à l’époque moderne, une voiture de patrouille sillonne les rues, gyrophare allumé.',
  },
  fire: {
    id: 'fire', size: 2, minAge: 0, icon: '🚒', cat: 'service',
    names: ['Guetteurs', 'Poste des vigiles', 'Tour de guet', 'Caserne de pompiers', 'Centre de secours', 'Base de drones de secours'],
    desc: 'Veille sur les environs.',
    jobs: [1, 2, 3, 5, 7, 8],
    perk: 'Les incendies à 14 cases sont éteints en quelques instants, même loin de l’eau. Les secours veillent sur les expéditions : risque −5 %, −10 % face aux chutes, à l’eau vive et aux intempéries (avec la police, −15 % au plus).',
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
    desc: 'La gare de l’âge futuriste : les rames à grande vitesse des lignes s’y arrêtent, et la navette à sustentation magnétique file sans un bruit sur son anneau suspendu.',
    perk: 'Une gare comme les autres pour le chemin de fer : choisissez-la puis « Nouvelle ligne » pour la relier aux autres gares.',
    jobs: [0, 0, 0, 0, 0, 8], joy: [0, 0, 0, 0, 0, 9],
  },
  // les défenses de l'île du portail (seulement là, voir `World.portalRule`) ; leur garnison viendra avec le contrôle des troupes
  watchtower: {
    id: 'watchtower', size: 1, minAge: 1, icon: '🏹', cat: 'war',
    names: ['', 'Tour de garde', 'Tour de guet', 'Tour de garde', 'Poste de défense', 'Tour de défense'],
    desc: 'Une tour de pierre et ses archers, qui guettent le portail des Enfers depuis l’île de l’autre rive.',
    perk: 'Ne se bâtit que sur l’île du portail, une fois le portail ouvert (expédition « Le portail de l’autre rive »). Ses guetteurs voient venir les démons de loin.',
    reqMission: 'portal',
  },
  barracks: {
    id: 'barracks', size: 2, minAge: 1, icon: '⚔️', cat: 'war',
    names: ['', 'Caserne', 'Caserne', 'Caserne', 'Base militaire', 'Base de défense'],
    desc: 'Le quartier de la garnison de l’île du portail : dortoirs, cour d’exercice et râteliers d’armes.',
    perk: 'Ne se bâtit que sur l’île du portail, une fois le portail ouvert (expédition « Le portail de l’autre rive ») et une première tour de garde dressée. La garnison y loge et s’y entraîne pour défendre l’île.',
    reqKind: 'watchtower',
  },
};

/** Les défenses : elles ne se bâtissent que sur l'île du portail, et l'on n'y bâtit qu'elles */
export const DEFENSES: KindId[] = ['watchtower', 'barracks'];

export const KIND_ORDER: KindId[] = ['house', 'arcology', 'well', 'watertower', 'lamp', 'farm', 'vfarm', 'pen', 'stable', 'apiary', 'pier', 'lumber', 'quarry', 'workshop', 'carworks', 'mine', 'oilwell', 'refinery', 'brickworks', 'harbor', 'shipyard', 'fishmarket', 'offshore', 'mill', 'fusion', 'health', 'school', 'fire', 'police', 'lighthouse', 'watchtower', 'barracks', 'lab', 'research', 'observatory', 'airport', 'heliport', 'spaceport', 'aerodrome', 'senate', 'gather', 'forum', 'tavern', 'barber', 'baths', 'theater', 'tennis', 'basket', 'football', 'stadium', 'waterpark', 'funfair', 'circus', 'zoo', 'alpine', 'temple', 'acropolis', 'landmark', 'station', 'terminal', 'maglev'];

export const BUILD_CATS: { id: BuildCat; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Habitat' },
  { id: 'prod', icon: '🌾', label: 'Production' },
  { id: 'service', icon: '🏥', label: 'Services' },
  { id: 'life', icon: '🎭', label: 'Vie & culture' },
  { id: 'war', icon: '⚔️', label: 'Militaire' },
];

/** Groupes de lecture d'un rayon (titres dans la rangée de vignettes) */
export interface BuildSub { id: string; label: string }
export const BUILD_SUBS: Record<BuildCat, BuildSub[]> = {
  home: [{ id: 'logis', label: 'Logements' }, { id: 'eau', label: 'Eau' }, { id: 'lumiere', label: 'Éclairage' }],
  prod: [{ id: 'nourriture', label: 'Nourriture' }, { id: 'materiaux', label: 'Matériaux' }, { id: 'industrie', label: 'Industrie' }],
  service: [{ id: 'sante', label: 'Santé' }, { id: 'savoir', label: 'Savoir' }, { id: 'securite', label: 'Sécurité' }, { id: 'transport', label: 'Transport' }],
  war: [{ id: 'defense', label: 'Défense de l’île' }],
  life: [{ id: 'parcs', label: 'Parcs et décor' }, { id: 'detente', label: 'Détente' }, { id: 'culte', label: 'Culte' }, { id: 'monuments', label: 'Monuments' }],
};

/** Le groupe de chaque bâtiment dans son rayon (n'a aucun effet sur le jeu ni sur la sauvegarde) */
export const KIND_SUB: Record<KindId, string> = {
  house: 'logis', manor: 'logis', arcology: 'logis', well: 'eau', watertower: 'eau', lamp: 'lumiere',
  farm: 'nourriture', vfarm: 'nourriture', pen: 'nourriture', stable: 'nourriture', apiary: 'nourriture', pier: 'nourriture', fishmarket: 'nourriture', offshore: 'nourriture',
  lumber: 'materiaux', quarry: 'materiaux', mine: 'materiaux', brickworks: 'materiaux',
  workshop: 'industrie', carworks: 'industrie', mill: 'industrie', oilwell: 'industrie', refinery: 'industrie', fusion: 'industrie', harbor: 'industrie', shipyard: 'industrie',
  health: 'sante', school: 'savoir', observatory: 'savoir', lab: 'savoir', research: 'savoir',
  police: 'securite', fire: 'securite', senate: 'securite', watchtower: 'defense', barracks: 'defense', lighthouse: 'securite',
  station: 'transport', terminal: 'transport', maglev: 'transport', airport: 'transport', heliport: 'transport', spaceport: 'transport',
  gather: 'parcs',
  tavern: 'detente', barber: 'detente', baths: 'detente', theater: 'detente', tennis: 'detente', basket: 'detente', football: 'detente', stadium: 'detente',
  waterpark: 'detente', funfair: 'detente', circus: 'detente', zoo: 'detente', alpine: 'detente', aerodrome: 'detente',
  temple: 'culte', acropolis: 'monuments', landmark: 'monuments', forum: 'monuments',
};

export interface AgeDef {
  name: string;
  tagline: string;
  /** Prérequis pour ATTEINDRE cet âge */
  reqPop: number;
  reqKinds: Partial<Record<KindId, number>>;
  /** minerai en réserve (la mine en extrait chaque jour) */
  reqOre?: number;
  /** briques en réserve au village (la briqueterie en cuit) */
  reqBrick?: number;
  /** bâtiments demandés en fin d'âge, après ses expéditions obligatoires (la raffinerie qu'ouvre « L'or noir », ses puits) */
  reqLate?: Partial<Record<KindId, number>>;
  /** tout à la fin : un premier chemin de fer posé, puis deux gares reliées par le rail */
  reqRail?: boolean;
}

export const AGES: AgeDef[] = [
  { name: 'Préhistoire', tagline: 'Feux de camp et huttes', reqPop: 0, reqKinds: {} },
  { name: 'Antiquité', tagline: 'Maisons de tuiles, temples et agoras', reqPop: 12, reqKinds: { house: 4, farm: 1, well: 1, workshop: 1 } },
  { name: 'Médiéval', tagline: 'Colombages, églises et châteaux', reqPop: 30, reqKinds: { house: 8, temple: 1, workshop: 2, gather: 1 } },
  { name: 'Industriel', tagline: 'Briques, cheminées et gares', reqPop: 60, reqKinds: { house: 12, temple: 1, mill: 1, quarry: 1, landmark: 1, gather: 2, health: 1 }, reqOre: 12 },
  { name: 'Moderne', tagline: 'Tours, éoliennes et parcs', reqPop: 110, reqKinds: { house: 18, mill: 2, landmark: 1, gather: 3, farm: 2, school: 1 }, reqOre: 30, reqBrick: 40, reqLate: { refinery: 1, oilwell: 2 }, reqRail: true },
  { name: 'Futuriste', tagline: 'Arcologies, maglev et fusées', reqPop: 180, reqKinds: { house: 24, workshop: 3, school: 2, lab: 1, health: 1, gather: 4 }, reqOre: 50, reqBrick: 80 },
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
  stable: 'écuries', apiary: 'ruchers', baths: 'thermes et piscines', tavern: 'tavernes', mine: 'mines', observatory: 'observatoires', lumber: 'bûcherons', quarry: 'carrières', station: 'gares',
  barber: 'coiffeurs', alpine: 'clubs alpins', police: 'commissariats', terminal: 'gares centrales',
  theater: 'théâtres', acropolis: 'acropoles', forum: 'forums et marchés', senate: 'sénats',
  harbor: 'ports', airport: 'aéroports', heliport: 'héliports', watertower: 'châteaux d’eau', stadium: 'stades', football: 'terrains de football', basket: 'terrains de basket', tennis: 'courts de tennis', waterpark: 'parcs aquatiques', funfair: 'parcs d’attractions', circus: 'cirques', zoo: 'zoos',
  carworks: 'usines automobiles', lab: 'laboratoires', aerodrome: 'aérodromes', manor: 'manoirs', oilwell: 'puits de pétrole', refinery: 'raffineries', brickworks: 'briqueteries',
  arcology: 'arcologies', vfarm: 'fermes verticales', fusion: 'centrales à fusion', spaceport: 'cosmodromes', research: 'instituts de recherche', maglev: 'gares maglev',
  watchtower: 'tours de garde', barracks: 'casernes de la garnison',
  shipyard: 'chantiers navals', lighthouse: 'phares', fishmarket: 'halles aux poissons', offshore: 'fermes marines',
};

/**
 * Améliorations proposées sur la fiche d'un bâtiment : il devient un autre, plus grand ou plus riche, sur place (son emprise
 * s'étend au besoin sur les cases libres derrière lui), contre le prix du nouveau bâtiment
 */
export const UPGRADES: { from: KindId; to: KindId }[] = [
  { from: 'house', to: 'manor' },
  { from: 'well', to: 'watertower' },
  // à l'âge futuriste, la gare intermodale devient la gare maglev (ses lignes s'y arrêtent toujours)
  { from: 'terminal', to: 'maglev' },
  { from: 'pier', to: 'harbor' },
  { from: 'workshop', to: 'carworks' },
  { from: 'farm', to: 'vfarm' },
];

/** Un genre et tous ceux en lesquels il s'améliore (une maison devenue manoir compte encore comme une maison) */
export function lineOf(k: KindId): KindId[] {
  const out: KindId[] = [k];
  for (let i = 0; i < out.length; i++) for (const u of UPGRADES) if (u.from === out[i] && !out.includes(u.to)) out.push(u.to);
  return out;
}

/**
 * Lignée d'un genre exigé parmi d'autres (`reqs`) : sans ceux qui sont eux-mêmes exigés. Chaque équipement compte ainsi à
 * part : quand une mission demande le stade et le terrain de football, le stade (amélioré d'un terrain) ne vaut pas les deux
 */
export function reqLine(k: KindId, reqs: readonly KindId[]): KindId[] {
  return lineOf(k).filter((x) => x === k || !reqs.includes(x));
}

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

/**
 * Ancienne emprise des bâtiments qui ont grandi depuis les premières parties : une case de moins, sauf la place du village,
 * passée de 1 × 1 à 3 × 3 (le forum, son amélioration, de 2 × 2 à 3 × 3 avec elle)
 */
const OLD_SIZE: Partial<Record<KindId, number>> = { gather: 1 };
export const smallSize = (kind: KindId) => (OLD_SIZE[kind] ?? KINDS[kind].size - 1) as 1 | 2 | 3;

/** Emprise d'un bâtiment : celle de son genre, l'ancienne s'il est resté à l'ancienne taille (`small`) */
export const sizeOf = (b: Building) => (b.small ? smallSize(b.kind) : KINDS[b.kind].size) as 1 | 2 | 3 | 4;

/** Bâtiments sans porte ni chemin d'accès : le lampadaire, et la place du village, qu'on rejoint de tous côtés */
export const hasDoor = (kind: KindId) => kind !== 'lamp' && kind !== 'gather';

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
