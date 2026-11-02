export type KindId = 'house' | 'farm' | 'pen' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire'
  | 'stable' | 'apiary' | 'baths' | 'tavern' | 'mine' | 'observatory' | 'outpost' | 'lumber' | 'quarry' | 'station';

/** Rayons de la barre de construction */
export type BuildCat = 'home' | 'prod' | 'service' | 'life';

export interface KindDef {
  id: KindId;
  size: 1 | 2;
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
    names: ['Hutte', 'Cabane', 'Maison à colombages', 'Maison de brique', 'Résidence'],
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
    names: ['', '', 'Moulin', 'Usine à cheminée', 'Éolienne'],
    desc: 'Travail et un peu de nourriture.',
    jobs: [0, 0, 7, 14, 18], food: [0, 0, 6, 6, 8],
  },
  landmark: {
    id: 'landmark', size: 2, minAge: 2, icon: '🏰', cat: 'life',
    names: ['', '', 'Château', 'Gare', 'Gare centrale'],
    desc: 'Grand bâtiment emblématique (2×2).',
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
  baths: {
    id: 'baths', size: 2, minAge: 1, icon: '♨️', cat: 'life',
    names: ['', 'Thermes', 'Étuves', 'Bains publics', 'Centre aquatique'],
    desc: 'On s’y lave, on s’y soigne et on s’y retrouve.',
    joy: [0, 6, 8, 10, 13], health: [0, 10, 14, 20, 28], jobs: [0, 2, 2, 3, 5],
    perk: 'Débloqués par l’expédition « Les sources chaudes ».',
    reqMission: 'springs',
  },
  fire: {
    id: 'fire', size: 2, minAge: 0, icon: '🚒', cat: 'service',
    names: ['Guetteurs', 'Poste des vigiles', 'Tour de guet', 'Caserne de pompiers', 'Centre de secours'],
    desc: 'Veille sur les environs.',
    jobs: [1, 2, 3, 5, 7],
    perk: 'Les incendies à 14 cases sont éteints en quelques instants, même loin de l’eau.',
  },
};

export const KIND_ORDER: KindId[] = ['house', 'well', 'lamp', 'farm', 'pen', 'stable', 'apiary', 'pier', 'lumber', 'quarry', 'workshop', 'mine', 'outpost', 'mill', 'health', 'school', 'fire', 'observatory', 'gather', 'tavern', 'baths', 'temple', 'landmark', 'station'];

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
  { name: 'Antiquité', tagline: 'Cabanes, temples et agoras', reqPop: 12, reqKinds: { house: 4, farm: 1, well: 1, workshop: 1 } },
  { name: 'Médiéval', tagline: 'Colombages, églises et châteaux', reqPop: 30, reqKinds: { house: 8, temple: 1, workshop: 2, gather: 1 } },
  { name: 'Industriel', tagline: 'Briques, cheminées et gares', reqPop: 60, reqKinds: { house: 12, temple: 1, mill: 1, landmark: 1, gather: 2, health: 1 }, reqOre: 12 },
  { name: 'Moderne', tagline: 'Tours, éoliennes et parcs', reqPop: 110, reqKinds: { house: 18, mill: 2, landmark: 1, gather: 3, farm: 2, school: 1 }, reqOre: 30 },
];

export const KIND_LABEL: Record<KindId, string> = {
  house: 'maisons', farm: 'fermes', pen: 'enclos', pier: 'pontons de pêche', well: 'puits', workshop: 'ateliers', gather: 'lieux de rencontre',
  temple: 'lieux de culte', mill: 'moulins/usines', landmark: 'bâtiments majeurs', lamp: 'lampadaires',
  health: 'lieux de soins', school: 'écoles', fire: 'casernes',
  stable: 'écuries', apiary: 'ruchers', baths: 'thermes', tavern: 'tavernes', mine: 'mines', observatory: 'observatoires', outpost: 'avant-postes', lumber: 'bûcherons', quarry: 'carrières', station: 'gares',
};

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
export const sizeOf = (b: Building) => (b.small ? 1 : KINDS[b.kind].size);

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
