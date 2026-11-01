export type KindId = 'house' | 'farm' | 'pier' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp' | 'health' | 'school' | 'fire';

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
  pier: {
    id: 'pier', size: 1, minAge: 0, icon: '🎣', cat: 'prod',
    names: ['Coin de pêche', 'Ponton de pêche', 'Pêcherie', 'Conserverie', 'Port de pêche'],
    desc: 'Nourrit grâce aux poissons. À poser au bord de l’eau : mer, rivière ou lac.',
    food: [4, 6, 9, 13, 18], jobs: [1, 1, 2, 3, 3],
  },
  well: {
    id: 'well', size: 1, minAge: 0, icon: '💧', cat: 'home',
    names: ['Point d’eau', 'Puits', 'Puits couvert', 'Pompe', 'Fontaine'],
    desc: 'Fournit de l’eau. Une maison près d’une rivière en a déjà.',
    water: [8, 12, 18, 28, 40],
  },
  workshop: {
    id: 'workshop', size: 1, minAge: 0, icon: '🔨', cat: 'prod',
    names: ['Atelier de pierre', 'Atelier de poterie', 'Forge', 'Usine', 'Bureaux'],
    desc: 'Offre du travail.',
    jobs: [3, 4, 5, 8, 10],
  },
  gather: {
    id: 'gather', size: 1, minAge: 0, icon: '🔥', cat: 'life',
    names: ['Feu de camp', 'Agora', 'Marché', 'Parc', 'Place'],
    desc: 'Lieu de rencontre : augmente le bien-être.',
    joy: [4, 6, 8, 10, 12],
  },
  temple: {
    id: 'temple', size: 1, minAge: 1, icon: '⛪', cat: 'life',
    names: ['Autel', 'Temple', 'Église', 'Cathédrale', 'Centre culturel'],
    desc: 'Lieu de culte : beaucoup de bien-être.',
    joy: [4, 10, 14, 18, 22], jobs: [0, 1, 1, 2, 2],
  },
  mill: {
    id: 'mill', size: 1, minAge: 2, icon: '🌬️', cat: 'prod',
    names: ['', '', 'Moulin', 'Usine à cheminée', 'Éolienne'],
    desc: 'Travail et un peu de nourriture.',
    jobs: [0, 0, 5, 10, 12], food: [0, 0, 4, 4, 6],
  },
  landmark: {
    id: 'landmark', size: 2, minAge: 2, icon: '🏰', cat: 'life',
    names: ['', '', 'Château', 'Gare', 'Tours'],
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
    id: 'health', size: 1, minAge: 0, icon: '🏥', cat: 'service',
    names: ['Guérisseur', 'Asclépiéion', 'Hospice', 'Hôpital', 'Clinique'],
    desc: 'Soigne les habitants : la santé du village grandit avec lui.',
    health: [6, 10, 16, 26, 40], jobs: [1, 1, 2, 4, 6],
    perk: 'Les blessés des expéditions guérissent deux fois plus vite.',
  },
  school: {
    id: 'school', size: 1, minAge: 0, icon: '📚', cat: 'service',
    names: ['Cercle des anciens', 'Académie', 'École du monastère', 'École', 'Université'],
    desc: 'Transmet le savoir aux habitants.',
    joy: [2, 3, 4, 5, 6], jobs: [1, 2, 2, 3, 5],
    perk: 'Les expéditions sont plus sûres (risque −30 %).',
  },
  fire: {
    id: 'fire', size: 1, minAge: 0, icon: '🚒', cat: 'service',
    names: ['Guetteur', 'Vigiles', 'Tour de guet', 'Caserne de pompiers', 'Centre de secours'],
    desc: 'Veille sur les environs.',
    jobs: [1, 1, 2, 3, 4],
    perk: 'Les incendies à 12 cases sont éteints en quelques instants, même loin de l’eau.',
  },
};

export const KIND_ORDER: KindId[] = ['house', 'well', 'lamp', 'farm', 'pier', 'workshop', 'mill', 'health', 'school', 'fire', 'gather', 'temple', 'landmark'];

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
  house: 'maisons', farm: 'fermes', pier: 'pontons de pêche', well: 'puits', workshop: 'ateliers', gather: 'lieux de rencontre',
  temple: 'lieux de culte', mill: 'moulins/usines', landmark: 'bâtiments majeurs', lamp: 'lampadaires',
  health: 'lieux de soins', school: 'écoles', fire: 'casernes',
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
}

export const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
