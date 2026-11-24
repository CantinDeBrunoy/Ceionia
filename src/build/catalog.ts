export type KindId = 'house' | 'farm' | 'pen' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire'
  | 'stable' | 'apiary' | 'baths' | 'tavern' | 'mine' | 'observatory' | 'lumber' | 'quarry' | 'station' | 'barber' | 'alpine' | 'police' | 'terminal'
  | 'harbor' | 'airport' | 'heliport' | 'watertower' | 'stadium' | 'football' | 'basket' | 'tennis' | 'waterpark' | 'funfair' | 'circus' | 'arena' | 'zoo' | 'theater' | 'acropolis' | 'forum' | 'senate'
  | 'carworks' | 'lab' | 'aerodrome' | 'manor' | 'oilwell' | 'refinery' | 'brickworks'
  | 'arcology' | 'vfarm' | 'fusion' | 'spaceport' | 'research' | 'maglev'
  | 'watchtower' | 'barracks'
  // les remparts du village : un pan de mur (tracé libre) et une porte
  | 'wall' | 'gate'
  // le volet maritime : chantier naval, phare, halle aux poissons, ferme marine
  | 'shipyard' | 'lighthouse' | 'fishmarket' | 'offshore'
  // la diplomatie de l'archipel : le monument de la concorde (la paix des trois peuples) ; le comptoir chez l'allié (l'or)
  | 'concord' | 'tradepost'
  // la guerre gagnée : l'obélisque, puis l'arc de triomphe ; la paix signée : l'ambassade, puis le siège des nations unies
  | 'triumph' | 'embassy'
  // les décorations : haie, clôture, parterre de fleurs, banc, statue, pavés, fontaine (et le lampadaire, plus haut)
  | 'hedge' | 'fence' | 'flowerbed' | 'bench' | 'statue' | 'paving' | 'fountain'
  // la mare (expédition « Les grands bancs ») et le bassin à coraux (« Le récif »)
  | 'pond' | 'coralpool'
  // la maison des explorateurs (une équipe d'expédition de plus)
  | 'explorers'
  // l'époque moderne : le circuit automobile et la centrale électrique (étapes vers l'âge futuriste)
  | 'racetrack' | 'powerplant'
  // le cimetière : les défunts y reposent, le village n'en porte pas le deuil
  | 'cemetery'
  // le nouveau monde (chantier C) : la tête de pont chez le rival (la guerre), voir `sim/concession.ts`
  | 'frontTower' | 'frontInfirmary' | 'fort' | 'battery' | 'frontForge' | 'garrison' | 'milHospital' | 'soldierClub' | 'garrisonHouse' | 'milHeliport' | 'radar'
  // la base arrière de la guerre et la concession de la paix, chez l'allié
  | 'allyBarracks' | 'allyShipyard' | 'allyHospital'
  | 'merchantPort' | 'exchangeHall' | 'commonSchool' | 'dispensary' | 'researchCenter' | 'gamesSite';

/** Rayons de la barre de construction */
export type BuildCat = 'home' | 'prod' | 'service' | 'life' | 'deco' | 'war';

export interface KindDef {
  id: KindId;
  size: 1 | 2 | 3 | 4 | 6;
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
    desc: 'Du miel et de la cire pour le village. Les abeilles butinent les champs et les jardins voisins.',
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
    id: 'harbor', size: 3, minAge: 1, icon: '⚓', cat: 'prod',
    names: ['', 'Port', 'Port', 'Port de commerce', 'Port à conteneurs', 'Port automatisé'],
    desc: 'Quais, entrepôts et grues : les navires marchands y accostent, déchargent et repartent.',
    jobs: [0, 5, 6, 10, 14, 16], food: [0, 3, 4, 6, 8, 10],
    perk: 'Grande zone portuaire de 3 × 3 à poser au bord de la mer ou d’un lac : il suffit qu’un côté touche l’eau, le quai s’y tourne de lui-même et le bassin devant est creusé pour les grands navires (birème, cogue, vapeur, porte-conteneurs) qui entrent, s’amarrent au quai et repartent au large.',
  },
  shipyard: {
    id: 'shipyard', size: 3, minAge: 2, icon: '🚢', cat: 'prod',
    names: ['', '', 'Chantier naval', 'Chantier à vapeur', 'Grand chantier naval', 'Chantier robotisé'],
    desc: 'Sur sa cale, une coque en construction, avec ses charpentiers, sa scie de long et sa grue. Des navires neufs y sont mis à l’eau.',
    jobs: [0, 0, 6, 9, 12, 14], joy: [0, 0, 1, 1, 2, 2],
    reqMission: 'caravel',
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Débloqué par l’expédition « La caravelle ». Les expéditions en mer sont plus sûres (risque −10 %), et des navires de l’époque (caravelle, vapeur, cargo, navire futuriste) sortent du chantier pour sillonner la mer.',
  },
  lighthouse: {
    id: 'lighthouse', size: 2, minAge: 2, icon: '🗼', cat: 'service',
    names: ['', '', 'Phare', 'Phare à lentille', 'Phare électrique', 'Phare automatisé'],
    desc: 'Une haute tour rayée sur la côte : son feu guide les marins, la nuit, par-dessus les récifs.',
    jobs: [0, 0, 2, 3, 3, 3], joy: [0, 0, 2, 3, 4, 4],
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Son faisceau balaie la mer la nuit, et les expéditions en mer sont plus sûres (risque −12 %).',
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
    perk: 'À poser près de la mer (à 5 cases de l’eau au plus). Les poissons et algues d’élevage nourrissent le village, et l’éolienne tourne dans le vent du large.',
  },
  racetrack: {
    id: 'racetrack', size: 3, minAge: 4, icon: '🏁', cat: 'life',
    names: ['', '', '', '', 'Circuit automobile', 'Circuit antigravité'],
    desc: 'Une piste en anneau, ses vibreurs et ses murs de pneus, la tribune, les stands et la tour de contrôle : les bolides tournent sans relâche sous les vivats.',
    joy: [0, 0, 0, 0, 14, 16], jobs: [0, 0, 0, 0, 6, 8],
    perk: 'Grand bâtiment de 3 × 3 cases. Les voitures de course tournent sur la piste, la foule remplit la tribune et le vainqueur monte sur le podium. Avec l’aéroport et la centrale électrique, une des étapes de l’époque moderne vers l’âge futuriste.',
  },
  powerplant: {
    id: 'powerplant', size: 3, minAge: 4, icon: '⚡', cat: 'prod',
    names: ['', '', '', '', 'Centrale électrique', 'Centrale à hydrogène'],
    desc: 'La salle des turbines, ses hautes cheminées et sa tour de refroidissement qui fume, le poste de transformation et les lignes qui partent vers la ville.',
    jobs: [0, 0, 0, 0, 18, 22],
    perk: 'Grand bâtiment de 3 × 3 cases. Avec l’aéroport et le circuit automobile, une des étapes de l’époque moderne vers l’âge futuriste.',
  },
  airport: {
    id: 'airport', size: 4, minAge: 4, icon: '✈️', cat: 'service',
    names: ['', '', '', '', 'Aéroport', 'Aéroport hypersonique'],
    desc: 'Piste, aérogare et ses passerelles, tour de contrôle, hangar, radar : les avions décollent et se posent.',
    jobs: [0, 0, 0, 0, 24, 28], joy: [0, 0, 0, 0, 10, 12],
    perk: 'Très grand bâtiment de 4 × 4 cases, sur un terrain plat. Un avion quitte son poste, roule par les voies jusqu’au seuil, décolle, fait un grand tour au-dessus du pays, revient dans l’axe, se pose et regagne son poste. Un long-courrier attend à la passerelle.',
  },
  heliport: {
    id: 'heliport', size: 2, minAge: 4, icon: '🚁', cat: 'service',
    names: ['', '', '', '', 'Héliport', 'Droneport'],
    desc: 'Deux aires d’atterrissage balisées, hangar, salon des passagers et sa terrasse : les hélicoptères emmènent les visiteurs survoler le pays.',
    jobs: [0, 0, 0, 0, 8, 9], joy: [0, 0, 0, 0, 6, 7],
    perk: 'Bâtiment de 2 × 2 cases. Deux hélicoptères aux couleurs de l’héliport attendent sur leur aire, lancent leur rotor, décollent, emmènent leurs passagers faire le tour du pays, s’y tiennent en vol stationnaire au-dessus des curiosités, reviennent et se posent. La nuit, les feux de balisage s’allument. Les expéditions de la montagne et du bout du monde partent en hélicoptère : l’équipe monte à bord à l’héliport, vole jusqu’à sa destination, s’y pose, travaille, puis rentre de la même façon.',
  },
  lumber: {
    id: 'lumber', size: 1, minAge: 0, icon: '🪓', cat: 'prod',
    names: ['Abri de bûcheron', 'Camp de bûcherons', 'Scierie', 'Scierie à vapeur', 'Scierie mécanique', 'Scierie robotisée'],
    desc: 'Abat et débite le bois de la forêt voisine. À poser en lisière ou dans une forêt.',
    jobs: [1, 2, 2, 3, 3, 3],
    perk: 'Donne du bois chaque jour pour bâtir les grands bâtiments. D’un âge à l’autre, il en coupe davantage.',
  },
  quarry: {
    id: 'quarry', size: 1, minAge: 0, icon: '🪨', cat: 'prod',
    names: ['Pierrier', 'Carrière', 'Carrière', 'Carrière à treuil', 'Carrière mécanisée', 'Carrière robotisée'],
    desc: 'Taille la pierre des rochers voisins. À poser près des rochers ou dans la montagne.',
    jobs: [1, 2, 2, 3, 3, 3],
    perk: 'Donne de la pierre chaque jour pour bâtir les grands bâtiments. D’un âge à l’autre, elle en taille davantage.',
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
  cemetery: {
    id: 'cemetery', size: 2, minAge: 0, icon: '🕊️', cat: 'life',
    names: ['Tertre des ancêtres', 'Nécropole', 'Cimetière paroissial', 'Cimetière à chapelle', 'Parc du souvenir', 'Jardin du souvenir'],
    desc: 'Le village y garde la mémoire des siens, entre les fleurs et les arbres. On y vient se recueillir.',
    // un peu de bien-être, comme un petit jardin ; son vrai rôle vient avec les décès (voir mishaps.ts)
    joy: [1, 1, 2, 2, 3, 3], jobs: [0, 0, 1, 1, 1, 2],
    perk: 'Un habitant qui meurt y est mené par un petit cortège et y repose. Sans cimetière, chaque décès coûte un peu de bien-être pendant deux jours. Un seul suffit.',
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
    id: 'lamp', size: 1, minAge: 0, icon: '💡', cat: 'deco',
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
    desc: 'Scrute le ciel. Les nuits d’étoiles filantes, tout le village y monte.',
    joy: [0, 0, 0, 0, 8, 10], jobs: [0, 0, 0, 0, 3, 4],
    perk: 'Débloqué par l’expédition « La pluie d’étoiles ». Les expéditions sont plus sûres (risque −15 %).',
    reqMission: 'stars',
  },
  explorers: {
    id: 'explorers', size: 2, minAge: 2, icon: '🧭', cat: 'service',
    names: ['', '', 'Maison des explorateurs', 'Société de géographie', 'Club des explorateurs', 'Base des explorateurs'],
    desc: 'Cartes, globe, malles et trophées de voyage : les explorateurs du village s’y retrouvent et y préparent leurs départs.',
    joy: [0, 0, 2, 3, 4, 5], jobs: [0, 0, 2, 3, 4, 5],
    perk: 'Une équipe d’expédition de plus : le village peut en envoyer une de plus à la fois. Une seule maison suffit, une deuxième n’ajoute rien.',
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
    perk: 'Se pose au pied d’une grosse montagne, jamais sur ses pentes. Des cordées grimpent les parois voisines. Quand la neige tient, des skieurs dévalent les pentes jusqu’au chalet (un télésiège les remonte à l’époque moderne). À l’époque moderne, des wingsuits s’élancent aussi du sommet et un parapente tourne au-dessus des pentes.',
  },
  stadium: {
    id: 'stadium', size: 3, minAge: 3, icon: '🏟️', cat: 'life',
    // (« Stade » tout court jusqu'au 22 nov. 2026 : on le confondait avec le stade de football, retour de joueurs)
    names: ['', '', '', 'Stade d’athlétisme', 'Grand stade d’athlétisme', 'Stade d’athlétisme à dôme'],
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
    perk: 'La troupe s’installe au village : fêtes et rires toute l’année.',
    reqMission: 'fair',
  },
  arena: {
    id: 'arena', size: 3, minAge: 1, icon: '🥊', cat: 'life',
    names: ['', 'Colisée', 'Champ de joute', 'Arène de lutte', 'Palais de la boxe', 'Arène des robots'],
    desc: 'Le grand lieu des combats : pugilistes au Colisée, chevaliers qui joutent, lutteurs sous la verrière, boxeurs sur le ring, puis robots géants dans leur cage de lumière.',
    joy: [0, 12, 15, 18, 22, 28], jobs: [0, 3, 3, 4, 5, 6],
    perk: 'Les gradins sont pleins : chaque combat fait vibrer tout le village.',
    reqMission: 'pugilat',
  },
  zoo: {
    id: 'zoo', size: 3, minAge: 4, icon: '🦒', cat: 'life',
    names: ['', '', '', '', 'Zoo', 'Parc zoologique'],
    desc: 'Éléphant, girafe, ours, crocodile, tortues et lézards dans leurs enclos clôturés, bassins, allées, kiosque et soigneurs : la sortie du dimanche.',
    joy: [0, 0, 0, 0, 12, 16], jobs: [0, 0, 0, 0, 5, 7],
    perk: 'Grand bâtiment de 3 × 3 cases. Les visiteurs flânent d’un enclos à l’autre, et le soigneur nourrit les bêtes.',
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
    perk: 'Avec la course automobile gagnée, et une raffinerie au village, les voitures remplacent les charrettes sur les routes (les écuries gardent leurs chevaux pour la cavalerie). Les voitures roulent au carburant : 2 par jour pour chaque usine. Sans carburant, elles restent au garage.',
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
    desc: 'Les montgolfières s’élèvent au-dessus du village, le dirigeable largue les amarres pour un grand tour et revient à son mât. Un biplan et son hangar bordent la piste d’herbe.',
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
    perk: 'Les rondes rassurent les habitants : un peu de bien-être. Des gardes escortent les expéditions : risque −5 %, −10 % face aux bêtes sauvages et aux créatures (avec les pompiers, −15 % au plus). À l’âge industriel, le fourgon de la police fait sa tournée. À l’époque moderne, une voiture de patrouille sillonne les rues, gyrophare allumé.',
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
    desc: 'Une tour de verre où les cultures montent étage par étage sous les lampes roses, et les drones emportent les récoltes.',
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
    desc: 'Un anneau blanc autour d’une sphère de verre où brille l’ordinateur quantique. Les chercheurs y préparent les grandes expéditions.',
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
  concord: {
    id: 'concord', size: 2, minAge: 2, icon: '🕊️', cat: 'life',
    names: ['', '', 'Monument de la concorde', 'Monument de la concorde', 'Monument de la concorde', 'Monument de la concorde'],
    desc: 'Trois piliers, un par peuple, sous un même anneau : la paix signée entre notre village et les deux îles.',
    joy: [0, 0, 8, 10, 12, 14], jobs: [0, 0, 2, 2, 2, 2],
    perk: 'Débloqué par l’expédition « L’ambassade de la paix », sur la voie de la paix (archipel).',
    reqMission: 'truce',
  },
  // la guerre des deux îles gagnée aux côtés de l'allié (demande de l'auteur, 17 nov. 2026) : proposé seulement alors (`kindOffered`)
  triumph: {
    id: 'triumph', size: 2, minAge: 2, icon: '🏛️', cat: 'life',
    names: ['', '', 'Obélisque de la victoire', 'Arc de triomphe', 'Arc de triomphe', 'Arc de triomphe'],
    desc: 'Le souvenir de la guerre gagnée aux côtés de notre allié : un obélisque au Médiéval, puis un arc de triomphe sous lequel passe l’avenue.',
    joy: [0, 0, 8, 10, 12, 14], jobs: [0, 0, 2, 2, 2, 2],
    perk: 'Débloqué par la victoire dans la guerre des deux îles, sur la voie de la guerre (archipel). Il évolue avec les âges.',
  },
  // la paix signée (« L'ambassade de la paix ») : l'ambassade, qui devient le siège des nations unies
  embassy: {
    id: 'embassy', size: 2, minAge: 2, icon: '🌐', cat: 'life',
    names: ['', '', 'Ambassade', 'Palais des nations', 'Siège des Nations unies', 'Siège des Nations unies'],
    desc: 'Les trois peuples réconciliés y parlent ensemble : une ambassade au Médiéval, le palais des nations à l’Industriel, puis le siège des Nations unies.',
    joy: [0, 0, 6, 8, 10, 12], jobs: [0, 0, 4, 6, 8, 10],
    perk: 'Débloqué par l’expédition « L’ambassade de la paix », sur la voie de la paix (archipel). Il évolue avec les âges.',
  },
  // le comptoir : chez l'allié seulement (voir `tradepostWhy`, allyLand.ts) ; il ouvre l'échange contre de l'or (trade.ts)
  tradepost: {
    id: 'tradepost', size: 2, minAge: 2, icon: '💰', cat: 'prod',
    names: ['', '', 'Comptoir', 'Comptoir de commerce', 'Maison de négoce', 'Bourse d’échanges'],
    desc: 'Notre comptoir chez le peuple allié : un entrepôt, des étals et la balance du changeur. On y vend nos matériaux contre de l’or.',
    jobs: [0, 0, 3, 4, 5, 6],
    perk: 'Se bâtit sur l’île de votre allié, hors de sa ville. Il ouvre l’échange : un clic sur l’or (barre des stocks) ouvre le comptoir, où l’on vend bois, pierre ou minerai contre l’or qui fait passer les âges.',
  },
  // ---- le nouveau monde (chantier C) : les zones des îles rivales, voir `sim/concession.ts` et `docs/diplomatie.md` ----
  // la tête de pont (la guerre) : seulement dans la zone rivale, une fois la plage prise ; ils comptent par leur présence
  frontTower: {
    id: 'frontTower', size: 1, minAge: 2, icon: '🗼', cat: 'war',
    names: ['', '', 'Tour de guet du camp', 'Tour de guet du camp', 'Mirador blindé', 'Tour de défense du camp'],
    desc: 'Une tour de guet au bord de notre camp, sur l’île rivale : ses guetteurs voient venir les sorties et leurs archers les accueillent.',
    perk: 'Dans la tête de pont. Pendant une sortie rivale, la tour tire sur les assaillants.',
  },
  frontInfirmary: {
    id: 'frontInfirmary', size: 2, minAge: 2, icon: '⛑️', cat: 'war',
    names: ['', '', 'Infirmerie de campagne', 'Infirmerie de campagne', 'Poste de secours', 'Module médical'],
    desc: 'Des tentes à croix rouge, des brancards et des infirmiers au bord de notre camp : nos blessés y sont soignés sur place.',
    perk: 'Dans la tête de pont. Les pertes du corps expéditionnaire se refont deux fois plus vite.',
  },
  fort: {
    id: 'fort', size: 6, minAge: 3, icon: '🏰', cat: 'war',
    names: ['', '', '', 'Fort de la tête de pont', 'Fort de la tête de pont', 'Citadelle de la tête de pont'],
    desc: 'Le camp de la plage devient un fort : une enceinte basse en étoile, ses bastions, ses casemates et notre drapeau au mât.',
    perk: 'Dans la tête de pont, une fois le port pris. Le chapitre de l’Industriel le demande. Le camp a deux fois plus de vie quand la ville rivale fait une sortie.',
  },
  battery: {
    id: 'battery', size: 2, minAge: 3, icon: '💥', cat: 'war',
    names: ['', '', '', 'Batterie côtière', 'Batterie côtière', 'Batterie de lanceurs'],
    desc: 'Des canons sur leur plateforme, derrière un parapet tourné vers la mer : ils battent le bras de mer.',
    perk: 'Dans la tête de pont. Dans les batailles en mer, la batterie pilonne la flotte rivale : un de ses navires en moins.',
  },
  frontForge: {
    id: 'frontForge', size: 2, minAge: 3, icon: '⚒️', cat: 'war',
    names: ['', '', '', 'Forge du front', 'Atelier d’armement', 'Atelier d’armement'],
    desc: 'Une forge de campagne où l’on répare les armes et refait les munitions du corps expéditionnaire.',
    perk: 'Dans la tête de pont. Le corps expéditionnaire frappe 20 % plus fort.',
  },
  garrison: {
    id: 'garrison', size: 2, minAge: 4, icon: '🪖', cat: 'war',
    names: ['', '', '', '', 'Caserne de la garnison', 'Caserne de la garnison'],
    desc: 'La caserne en dur de notre ville de garnison, autour du fort : dortoirs, cour d’exercice et mât des couleurs.',
    perk: 'Dans la tête de pont, après le fort. La ville de garnison (la caserne et deux autres de ses bâtiments) est demandée par le chapitre du Moderne. Le corps expéditionnaire grandit de 8 hommes.',
    reqKind: 'fort',
  },
  milHospital: {
    id: 'milHospital', size: 2, minAge: 4, icon: '🏥', cat: 'war',
    names: ['', '', '', '', 'Hôpital militaire', 'Hôpital militaire'],
    desc: 'L’hôpital de la ville de garnison : ses salles, son ambulance et l’hélicoptère des grands blessés.',
    perk: 'Dans la tête de pont, après le fort. Il compte pour la ville de garnison.',
    reqKind: 'fort',
  },
  soldierClub: {
    id: 'soldierClub', size: 2, minAge: 4, icon: '☕', cat: 'war',
    names: ['', '', '', '', 'Foyer du soldat', 'Foyer du soldat'],
    desc: 'Le café de la garnison : une terrasse, des affiches et des soldats au repos entre deux gardes.',
    perk: 'Dans la tête de pont, après le fort. Il compte pour la ville de garnison.',
    reqKind: 'fort',
  },
  garrisonHouse: {
    id: 'garrisonHouse', size: 1, minAge: 4, icon: '🏘️', cat: 'war',
    names: ['', '', '', '', 'Maison de la garnison', 'Maison de la garnison'],
    desc: 'Le logement d’un sous-officier et de sa famille, dans la ville de garnison.',
    perk: 'Dans la tête de pont, après le fort. Elle compte pour la ville de garnison.',
    reqKind: 'fort',
  },
  milHeliport: {
    id: 'milHeliport', size: 2, minAge: 4, icon: '🚁', cat: 'war',
    names: ['', '', '', '', 'Héliport militaire', 'Héliport militaire'],
    desc: 'Une aire marquée, un hangar et un hélicoptère de l’armée prêt à décoller.',
    perk: 'Dans la tête de pont. Il prépare l’appui aérien de la bataille des deux îles.',
  },
  radar: {
    id: 'radar', size: 2, minAge: 4, icon: '📡', cat: 'war',
    names: ['', '', '', '', 'Station radar', 'Station radar'],
    desc: 'Une grande antenne qui tourne jour et nuit et son local technique : rien ne bouge sans qu’on le voie.',
    perk: 'Dans la tête de pont. Les sorties rivales s’annoncent un jour à l’avance au lieu d’une demi-journée.',
  },
  // la base arrière de la guerre, dans la concession alliée
  allyBarracks: {
    id: 'allyBarracks', size: 2, minAge: 2, icon: '🛡️', cat: 'war',
    names: ['', '', 'Caserne alliée', 'Caserne alliée', 'Caserne alliée', 'Caserne alliée'],
    desc: 'Nos alliés y entraînent des soldats pour notre guerre, sous leurs couleurs et les nôtres.',
    perk: 'Dans la concession, sur la voie de la guerre. Trois alliés de plus dans chaque bataille de l’île rivale.',
  },
  allyShipyard: {
    id: 'allyShipyard', size: 2, minAge: 2, icon: '⚓', cat: 'war',
    names: ['', '', 'Chantier naval allié', 'Chantier naval allié', 'Chantier naval allié', 'Chantier naval allié'],
    desc: 'Une cale où nos alliés arment un navire de guerre de plus pour notre flotte.',
    perk: 'Dans la concession, sur la voie de la guerre. Un navire allié de plus dans chaque bataille en mer.',
  },
  allyHospital: {
    id: 'allyHospital', size: 2, minAge: 2, icon: '⚕️', cat: 'war',
    names: ['', '', 'Hôpital allié', 'Hôpital allié', 'Hôpital allié', 'Hôpital allié'],
    desc: 'Les médecins de notre allié y soignent nos blessés graves avant de les renvoyer au front.',
    perk: 'Dans la concession, sur la voie de la guerre. Après chaque bataille, un tiers de nos tombés reviennent au corps.',
  },
  // la concession de la paix, chez l'allié
  merchantPort: {
    id: 'merchantPort', size: 3, minAge: 3, icon: '🛳️', cat: 'prod',
    names: ['', '', '', 'Port marchand partagé', 'Port marchand partagé', 'Port marchand partagé'],
    desc: 'Un grand quai, la gare maritime et deux pavillons, le nôtre et celui de l’allié : la ligne de vapeurs relie les îles.',
    perk: 'Dans la concession, sur la voie de la paix, près de l’eau. Le chapitre de l’Industriel le demande. La ligne de vapeurs rapporte 3 or par jour.',
  },
  exchangeHall: {
    id: 'exchangeHall', size: 2, minAge: 3, icon: '⚖️', cat: 'prod',
    names: ['', '', '', 'Halle des échanges', 'Halle des échanges', 'Bourse des îles'],
    desc: 'Une halle couverte, ses étals et le tableau des cours : les marchands des trois peuples y fixent les prix.',
    perk: 'Dans la concession, sur la voie de la paix. Une maison commune : les cours du comptoir baissent moitié moins vite quand on vend beaucoup.',
  },
  commonSchool: {
    id: 'commonSchool', size: 2, minAge: 3, icon: '🏫', cat: 'service',
    names: ['', '', '', 'École commune', 'École commune', 'École commune'],
    desc: 'Une aile à notre style, une aile au style de l’allié, une cour où jouent leurs enfants et les nôtres.',
    perk: 'Dans la concession, sur la voie de la paix. Une maison commune : les visites sur les îles sont plus sûres.',
  },
  dispensary: {
    id: 'dispensary', size: 2, minAge: 3, icon: '🩺', cat: 'service',
    names: ['', '', '', 'Dispensaire', 'Dispensaire', 'Dispensaire'],
    desc: 'Des réserves, des brancards et des médecins des deux peuples, prêts à partir au premier malheur.',
    perk: 'Dans la concession, sur la voie de la paix. Une maison commune : après une catastrophe, l’allié envoie de l’aide et les réparations vont deux fois plus vite.',
  },
  researchCenter: {
    id: 'researchCenter', size: 2, minAge: 4, icon: '🔬', cat: 'service',
    names: ['', '', '', '', 'Centre de recherche commun', 'Centre de recherche commun'],
    desc: 'Les savants des trois peuples y travaillent ensemble : laboratoires, verrière et antennes.',
    perk: 'Dans la concession, sur la voie de la paix. Les expéditions sont un peu plus sûres (risque −10 %).',
  },
  gamesSite: {
    id: 'gamesSite', size: 3, minAge: 4, icon: '🏟️', cat: 'service',
    names: ['', '', '', '', 'Site des Jeux des îles', 'Site des Jeux des îles'],
    desc: 'Le stade des trois peuples : sa piste, ses tribunes, la vasque de la flamme et les trois mâts de leurs drapeaux.',
    perk: 'Dans la concession, sur la voie de la paix, une fois la candidature acceptée. Les Jeux des îles s’y tiennent : le chantier se livre en trois fois.',
  },
  // les bâtiments militaires : au village comme sur l'île du portail (où l'on ne bâtit qu'eux, voir `World.portalRule`)
  watchtower: {
    id: 'watchtower', size: 1, minAge: 1, icon: '🏹', cat: 'war',
    names: ['', 'Tour de garde', 'Tour de guet', 'Tour de garde', 'Poste de défense', 'Tour de défense'],
    desc: 'Une tour et ses guetteurs : des soldats patrouillent dans les rues autour d’elle.',
    perk: 'Elle compte comme un poste de police pour la Sécurité et envoie une patrouille de deux soldats dans les rues voisines. Elle ouvre la caserne et les remparts.',
  },
  barracks: {
    id: 'barracks', size: 2, minAge: 1, icon: '⚔️', cat: 'war',
    names: ['', 'Caserne', 'Caserne', 'Caserne', 'Base militaire', 'Base de défense'],
    desc: 'Dortoirs, cour d’exercice et râteliers d’armes : les soldats y logent, et une patrouille en sort pour faire sa ronde.',
    perk: 'Au village, elle envoie une patrouille de trois soldats. Si vous ouvrez le portail des Enfers (le grand choix, fin de l’Antiquité), une caserne sur l’île du portail loge et soigne la garnison, et chaque caserne du village y ajoute des places.',
    reqKind: 'watchtower',
  },
  wall: {
    id: 'wall', size: 1, minAge: 1, icon: '🧱', cat: 'war',
    names: ['', 'Palissade', 'Muraille', 'Enceinte de brique', 'Mur de béton', 'Mur d’énergie'],
    desc: 'Un rempart qui ferme la ville, tracé d’un trait : un clic au point A, un clic au point B. Il s’interrompt de lui-même là où passe une route.',
    perk: 'Les pans se raccordent entre eux, avec un poteau ou une tourelle aux bouts et aux angles. Une porte ferme les passages. Décor : il ne gêne ni les habitants ni les véhicules.',
    reqKind: 'watchtower',
  },
  gate: {
    id: 'gate', size: 1, minAge: 1, icon: '🚪', cat: 'war',
    names: ['', 'Porte de palissade', 'Porte fortifiée', 'Porte de fer', 'Portail blindé', 'Porte à champ de force'],
    desc: 'La porte de la ville : deux tours et un passage, à poser dans un rempart ou en travers d’une route.',
    perk: 'Se pose sur une case libre ou sur une route (elle l’enjambe, battants ouverts). Elle se tourne d’elle-même dans l’axe du mur.',
    reqKind: 'watchtower',
  },
  // ---- les décorations : petites, presque gratuites, sans rôle obligatoire (voir `isDecor`, DECOR_JOY_MAX) ----
  hedge: {
    id: 'hedge', size: 1, minAge: 0, icon: '🌳', cat: 'deco',
    names: ['Haie d’épineux', 'Haie de myrtes', 'Haie vive', 'Haie de buis', 'Haie taillée', 'Haie lumineuse'],
    desc: 'Une haie qui borde un jardin ou une rue. Posées côte à côte, les haies se raccordent.',
    joy: [0.1],
    reqMission: 'berries',
  },
  fence: {
    id: 'fence', size: 1, minAge: 0, icon: '🪵', cat: 'deco',
    names: ['Palissade de pieux', 'Muret de pierres sèches', 'Plessis', 'Barrière blanche', 'Grille de jardin', 'Barrière de lumière'],
    desc: 'Une clôture pour fermer un jardin ou le bord d’une place. Posées côte à côte, les clôtures se raccordent.',
    joy: [0.05],
  },
  flowerbed: {
    id: 'flowerbed', size: 1, minAge: 0, icon: '🌷', cat: 'deco',
    names: ['Fleurs sauvages', 'Rosiers', 'Jardin de simples', 'Parterre de tulipes', 'Massif fleuri', 'Jardin suspendu'],
    desc: 'Un carré de fleurs. Les habitants aiment en avoir devant chez eux.',
    joy: [0.3],
  },
  bench: {
    id: 'bench', size: 1, minAge: 0, icon: '🪑', cat: 'deco',
    names: ['Rondins', 'Banc de marbre', 'Banc de chêne', 'Banc de square', 'Banc public', 'Banc flottant'],
    desc: 'Un banc où s’asseoir pour regarder passer le village.',
    joy: [0.2],
  },
  statue: {
    id: 'statue', size: 1, minAge: 0, icon: '🗿', cat: 'deco',
    names: ['Totem', 'Statue de marbre', 'Statue de saint', 'Statue de bronze', 'Sculpture', 'Statue holographique'],
    desc: 'Une statue sur son socle, fierté du quartier.',
    joy: [0.4],
    reqMission: 'flint',
  },
  paving: {
    id: 'paving', size: 1, minAge: 0, icon: '🧱', cat: 'deco',
    names: ['Pierres plates', 'Dallage de marbre', 'Pavés', 'Pavage de briques', 'Dalles', 'Dalles lumineuses'],
    desc: 'Pave une case du sol, bord à bord, pour une place ou une allée. On peut ensuite bâtir, poser une décoration ou tracer une route par-dessus. Glissez pour en paver plusieurs.',
    joy: [0.05],
  },
  fountain: {
    id: 'fountain', size: 1, minAge: 0, icon: '⛲', cat: 'deco',
    names: ['Source aménagée', 'Fontaine', 'Fontaine de pierre', 'Fontaine de fonte', 'Fontaine à jets', 'Fontaine en apesanteur'],
    desc: 'Une petite fontaine, son bassin et son filet d’eau.',
    joy: [0.5],
  },
  pond: {
    id: 'pond', size: 1, minAge: 1, icon: '🪷', cat: 'deco',
    names: ['', 'Mare aux nénuphars', 'Mare aux canards', 'Bassin de jardin', 'Bassin paysager', 'Bassin de lumière'],
    desc: 'Une petite mare creusée de main d’homme : de l’eau, des berges, des roseaux et des nénuphars.',
    joy: [0.4],
    reqMission: 'fishing',
  },
  coralpool: {
    id: 'coralpool', size: 1, minAge: 4, icon: '🪸', cat: 'deco',
    names: ['', '', '', '', 'Bassin à coraux', 'Récif sous verre'],
    desc: 'Un bassin d’eau de mer, ses coraux de toutes les couleurs et ses poissons du récif.',
    joy: [0.6],
    reqMission: 'reef',
  },
};

/** Les défenses : au village comme sur l'île du portail, où l'on ne bâtit qu'elles */
export const DEFENSES: KindId[] = ['watchtower', 'barracks', 'wall', 'gate'];
/** Les bâtiments militaires d'où partent les patrouilles du village */
export const GARRISONS: KindId[] = ['watchtower', 'barracks'];
/** Les remparts : un pan de mur se trace en ligne, la porte se pose seule ; tous deux se raccordent à leurs voisins */
export const isRampart = (k: KindId) => k === 'wall' || k === 'gate';
/** Les décorations libres (rayon Décorations), sans le lampadaire, plus ancien, qu'on range avec elles */
export const DECOR: KindId[] = ['hedge', 'fence', 'flowerbed', 'bench', 'statue', 'paving', 'fountain', 'pond', 'coralpool'];
/** Une décoration, lampadaire compris : ni porte, ni incendie, ni route qui y mène */
export const isDecor = (k: KindId) => k === 'lamp' || DECOR.includes(k);
/** Les décorations qu'on traverse à pied (les pavés, le lampadaire dans son coin) ; les autres se contournent */
export const walkableDecor = (k: KindId) => k === 'lamp' || k === 'paving';
/** Haies et clôtures : posées côte à côte, elles se raccordent à leurs voisines de même genre (voir `ModelOpts.mask`) */
export const isLinear = (k: KindId) => k === 'hedge' || k === 'fence';
/** Plafond du bien-être que donnent toutes les décorations ensemble (le lampadaire, plus ancien, compte à part) */
export const DECOR_JOY_MAX = 3;

export const KIND_ORDER: KindId[] = ['house', 'arcology', 'well', 'watertower', 'lamp', 'farm', 'vfarm', 'pen', 'stable', 'apiary', 'pier', 'lumber', 'quarry', 'workshop', 'carworks', 'mine', 'oilwell', 'refinery', 'powerplant', 'brickworks', 'harbor', 'tradepost', 'shipyard', 'fishmarket', 'offshore', 'mill', 'fusion', 'health', 'school', 'fire', 'police', 'lighthouse', 'watchtower', 'barracks', 'wall', 'gate', 'lab', 'research', 'observatory', 'explorers', 'airport', 'heliport', 'spaceport', 'aerodrome', 'senate', 'gather', 'forum', 'tavern', 'barber', 'baths', 'arena', 'theater', 'tennis', 'basket', 'football', 'stadium', 'waterpark', 'funfair', 'racetrack', 'circus', 'zoo', 'alpine', 'temple', 'cemetery', 'acropolis', 'landmark', 'concord', 'triumph', 'embassy', 'station', 'terminal', 'maglev',
  'frontTower', 'frontInfirmary', 'fort', 'battery', 'frontForge', 'garrison', 'milHospital', 'soldierClub', 'garrisonHouse', 'milHeliport', 'radar',
  'allyBarracks', 'allyShipyard', 'allyHospital', 'merchantPort', 'exchangeHall', 'commonSchool', 'dispensary', 'researchCenter', 'gamesSite', 'hedge', 'fence', 'flowerbed', 'paving', 'bench', 'statue', 'fountain', 'pond', 'coralpool'];

export const BUILD_CATS: { id: BuildCat; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Habitat' },
  { id: 'prod', icon: '🌾', label: 'Production' },
  { id: 'service', icon: '🏥', label: 'Services' },
  { id: 'life', icon: '🎭', label: 'Vie & culture' },
  { id: 'deco', icon: '🌷', label: 'Décorations' },
  { id: 'war', icon: '⚔️', label: 'Militaire' },
];

/** Groupes de lecture d'un rayon (titres dans la rangée de vignettes) */
export interface BuildSub { id: string; label: string }
export const BUILD_SUBS: Record<BuildCat, BuildSub[]> = {
  home: [{ id: 'logis', label: 'Logements' }, { id: 'eau', label: 'Eau' }],
  prod: [{ id: 'nourriture', label: 'Nourriture' }, { id: 'materiaux', label: 'Matériaux' }, { id: 'industrie', label: 'Industrie' }, { id: 'concession', label: 'Concession' }],
  service: [{ id: 'sante', label: 'Santé' }, { id: 'savoir', label: 'Savoir' }, { id: 'securite', label: 'Sécurité' }, { id: 'transport', label: 'Transport' }, { id: 'concession', label: 'Concession' }],
  war: [{ id: 'defense', label: 'Défense' }, { id: 'remparts', label: 'Remparts' }, { id: 'front', label: 'Tête de pont' }, { id: 'arriere', label: 'Base arrière' }],
  deco: [{ id: 'jardin', label: 'Jardins' }, { id: 'mobilier', label: 'Mobilier' }, { id: 'ornements', label: 'Ornements' }],
  life: [{ id: 'parcs', label: 'Places publiques' }, { id: 'detente', label: 'Détente' }, { id: 'culte', label: 'Culte' }, { id: 'monuments', label: 'Monuments' }],
};

/** Le groupe de chaque bâtiment dans son rayon (n'a aucun effet sur le jeu ni sur la sauvegarde) */
export const KIND_SUB: Record<KindId, string> = {
  house: 'logis', manor: 'logis', arcology: 'logis', well: 'eau', watertower: 'eau', lamp: 'mobilier',
  hedge: 'jardin', fence: 'jardin', flowerbed: 'jardin', paving: 'mobilier', bench: 'mobilier', statue: 'ornements', fountain: 'ornements', pond: 'jardin', coralpool: 'ornements',
  farm: 'nourriture', vfarm: 'nourriture', pen: 'nourriture', stable: 'nourriture', apiary: 'nourriture', pier: 'nourriture', fishmarket: 'nourriture', offshore: 'nourriture',
  lumber: 'materiaux', quarry: 'materiaux', mine: 'materiaux', brickworks: 'materiaux',
  workshop: 'industrie', carworks: 'industrie', mill: 'industrie', oilwell: 'industrie', refinery: 'industrie', powerplant: 'industrie', fusion: 'industrie', harbor: 'industrie', tradepost: 'industrie', shipyard: 'industrie',
  health: 'sante', school: 'savoir', observatory: 'savoir', explorers: 'savoir', lab: 'savoir', research: 'savoir',
  police: 'securite', fire: 'securite', senate: 'securite', watchtower: 'defense', barracks: 'defense', wall: 'remparts', gate: 'remparts', lighthouse: 'securite',
  station: 'transport', terminal: 'transport', maglev: 'transport', airport: 'transport', heliport: 'transport', spaceport: 'transport',
  gather: 'parcs',
  tavern: 'detente', barber: 'detente', baths: 'detente', theater: 'detente', tennis: 'detente', basket: 'detente', football: 'detente', stadium: 'detente',
  waterpark: 'detente', funfair: 'detente', racetrack: 'detente', circus: 'detente', arena: 'detente', zoo: 'detente', alpine: 'detente', aerodrome: 'detente',
  temple: 'culte', cemetery: 'culte', acropolis: 'monuments', landmark: 'monuments', forum: 'monuments', concord: 'monuments', triumph: 'monuments', embassy: 'monuments',
  frontTower: 'front', frontInfirmary: 'front', fort: 'front', battery: 'front', frontForge: 'front', garrison: 'front', milHospital: 'front', soldierClub: 'front', garrisonHouse: 'front', milHeliport: 'front', radar: 'front',
  allyBarracks: 'arriere', allyShipyard: 'arriere', allyHospital: 'arriere',
  merchantPort: 'concession', exchangeHall: 'concession', commonSchool: 'concession', dispensary: 'concession', researchCenter: 'concession', gamesSite: 'concession',
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
  /** or en réserve, seulement dans une partie qui a accepté l'archipel (voir `goldNeed`, trade.ts) */
  reqGold?: number;
  /** bâtiments demandés en fin d'âge, après ses expéditions obligatoires (la raffinerie qu'ouvre « L'or noir », ses puits) */
  reqLate?: Partial<Record<KindId, number>>;
  /** tout à la fin : un premier chemin de fer posé, puis deux gares reliées par le rail */
  reqRail?: boolean;
}

export const AGES: AgeDef[] = [
  { name: 'Préhistoire', tagline: 'Feux de camp et huttes', reqPop: 0, reqKinds: {} },
  { name: 'Antiquité', tagline: 'Maisons de tuiles, temples et agoras', reqPop: 12, reqKinds: { house: 4, farm: 1, well: 1, workshop: 1 } },
  { name: 'Médiéval', tagline: 'Colombages, églises et châteaux', reqPop: 30, reqKinds: { house: 8, temple: 1, workshop: 2, gather: 1 } },
  { name: 'Industriel', tagline: 'Briques, cheminées et gares', reqPop: 60, reqKinds: { house: 12, temple: 1, mill: 1, quarry: 1, landmark: 1, gather: 2, health: 1 }, reqOre: 12, reqGold: 20 },
  { name: 'Moderne', tagline: 'Tours, éoliennes et parcs', reqPop: 110, reqKinds: { house: 18, mill: 2, landmark: 1, gather: 3, farm: 2, school: 1, brickworks: 1 }, reqOre: 30, reqGold: 50, reqLate: { refinery: 1, oilwell: 2 }, reqRail: true },
  { name: 'Futuriste', tagline: 'Arcologies, maglev et fusées', reqPop: 180, reqKinds: { house: 24, workshop: 3, school: 2, lab: 1, health: 1, gather: 4 }, reqOre: 50, reqBrick: 80, reqGold: 100, reqLate: { airport: 1, racetrack: 1, powerplant: 1 } },
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
  harbor: 'ports', airport: 'aéroports', heliport: 'héliports', watertower: 'châteaux d’eau', stadium: 'stades d’athlétisme', football: 'terrains de football', basket: 'terrains de basket', tennis: 'courts de tennis', waterpark: 'parcs aquatiques', funfair: 'parcs d’attractions', circus: 'cirques', arena: 'arènes', zoo: 'zoos',
  carworks: 'usines automobiles', lab: 'laboratoires', aerodrome: 'aérodromes', manor: 'manoirs', oilwell: 'puits de pétrole', refinery: 'raffineries', brickworks: 'briqueteries',
  arcology: 'arcologies', vfarm: 'fermes verticales', fusion: 'centrales à fusion', spaceport: 'cosmodromes', research: 'instituts de recherche', maglev: 'gares maglev',
  watchtower: 'tours de garde', barracks: 'casernes de la garnison', wall: 'remparts', gate: 'portes de la ville',
  shipyard: 'chantiers navals', lighthouse: 'phares', fishmarket: 'halles aux poissons', offshore: 'fermes marines',
  concord: 'monuments de la concorde', tradepost: 'comptoirs', triumph: 'monuments de la victoire', embassy: 'ambassades',
  hedge: 'haies', fence: 'clôtures', flowerbed: 'parterres de fleurs', bench: 'bancs', statue: 'statues', paving: 'pavés', fountain: 'fontaines', pond: 'mares', coralpool: 'bassins à coraux',
  explorers: 'maisons des explorateurs', racetrack: 'circuits automobiles', powerplant: 'centrales électriques',
  cemetery: 'cimetières',
  frontTower: 'tours de guet du camp', frontInfirmary: 'infirmeries de campagne', fort: 'forts', battery: 'batteries côtières', frontForge: 'forges du front',
  garrison: 'casernes de la garnison', milHospital: 'hôpitaux militaires', soldierClub: 'foyers du soldat', garrisonHouse: 'maisons de la garnison', milHeliport: 'héliports militaires', radar: 'stations radar',
  allyBarracks: 'casernes alliées', allyShipyard: 'chantiers navals alliés', allyHospital: 'hôpitaux alliés',
  merchantPort: 'ports marchands partagés', exchangeHall: 'halles des échanges', commonSchool: 'écoles communes', dispensary: 'dispensaires', researchCenter: 'centres de recherche communs', gamesSite: 'sites des Jeux des îles',
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
  /** pan de rempart : tour forcée (vrai) ou simple pan forcé (faux) ; absent, la tour vient seule aux bouts et aux angles */
  tower?: boolean;
}

/**
 * Ancienne emprise des bâtiments qui ont grandi depuis les premières parties : une case de moins, sauf la place du village,
 * passée de 1 × 1 à 3 × 3 (le forum, son amélioration, de 2 × 2 à 3 × 3 avec elle)
 */
const OLD_SIZE: Partial<Record<KindId, number>> = { gather: 1, fort: 3 };
export const smallSize = (kind: KindId) => (OLD_SIZE[kind] ?? KINDS[kind].size - 1) as 1 | 2 | 3 | 4 | 6;

/** Emprise d'un bâtiment : celle de son genre, l'ancienne s'il est resté à l'ancienne taille (`small`) */
export const sizeOf = (b: Building) => (b.small ? smallSize(b.kind) : KINDS[b.kind].size) as 1 | 2 | 3 | 4 | 6;

/** Bâtiments sans porte ni chemin d'accès : les décorations (lampadaire compris), la place du village (qu'on rejoint de tous côtés), les remparts */
export const hasDoor = (kind: KindId) => !isDecor(kind) && kind !== 'gather' && !isRampart(kind);

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
