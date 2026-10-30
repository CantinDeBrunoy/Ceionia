export type KindId = 'house' | 'farm' | 'well' | 'workshop' | 'gather' | 'temple' | 'mill' | 'landmark' | 'lamp';

export interface KindDef {
  id: KindId;
  size: 1 | 2;
  minAge: number;
  icon: string;
  /** Nom par âge (index 0..4) */
  names: string[];
  desc: string;
  housing?: number[];
  food?: number[];
  water?: number[];
  jobs?: number[];
  joy?: number[];
}

export const KINDS: Record<KindId, KindDef> = {
  house: {
    id: 'house', size: 1, minAge: 0, icon: '🏠',
    names: ['Hutte', 'Cabane', 'Maison à colombages', 'Maison de brique', 'Résidence'],
    desc: 'Loge des habitants. Les maisons accolées fusionnent.',
    housing: [3, 4, 6, 9, 14],
  },
  farm: {
    id: 'farm', size: 1, minAge: 0, icon: '🌾',
    names: ['Séchoir à grains', 'Ferme', 'Grange', 'Ferme à silo', 'Serre'],
    desc: 'Nourrit les habitants.',
    food: [6, 9, 13, 20, 30], jobs: [1, 2, 2, 3, 3],
  },
  well: {
    id: 'well', size: 1, minAge: 0, icon: '💧',
    names: ['Point d’eau', 'Puits', 'Puits couvert', 'Pompe', 'Fontaine'],
    desc: 'Fournit de l’eau. Une maison près d’une rivière en a déjà.',
    water: [8, 12, 18, 28, 40],
  },
  workshop: {
    id: 'workshop', size: 1, minAge: 0, icon: '🔨',
    names: ['Atelier de pierre', 'Atelier de poterie', 'Forge', 'Usine', 'Bureaux'],
    desc: 'Offre du travail.',
    jobs: [3, 4, 5, 8, 10],
  },
  gather: {
    id: 'gather', size: 1, minAge: 0, icon: '🔥',
    names: ['Feu de camp', 'Agora', 'Marché', 'Parc', 'Place'],
    desc: 'Lieu de rencontre : augmente le bien-être.',
    joy: [4, 6, 8, 10, 12],
  },
  temple: {
    id: 'temple', size: 1, minAge: 1, icon: '⛪',
    names: ['Autel', 'Temple', 'Église', 'Cathédrale', 'Centre culturel'],
    desc: 'Lieu de culte : beaucoup de bien-être.',
    joy: [4, 10, 14, 18, 22], jobs: [0, 1, 1, 2, 2],
  },
  mill: {
    id: 'mill', size: 1, minAge: 2, icon: '🌬️',
    names: ['', '', 'Moulin', 'Usine à cheminée', 'Éolienne'],
    desc: 'Travail et un peu de nourriture.',
    jobs: [0, 0, 5, 10, 12], food: [0, 0, 4, 4, 6],
  },
  landmark: {
    id: 'landmark', size: 2, minAge: 2, icon: '🏰',
    names: ['', '', 'Château', 'Gare', 'Tours'],
    desc: 'Grand bâtiment emblématique (2×2).',
    jobs: [0, 0, 6, 12, 20], joy: [0, 0, 6, 6, 8],
  },
  lamp: {
    id: 'lamp', size: 1, minAge: 0, icon: '💡',
    names: ['Torche', 'Brasero', 'Lanterne', 'Lampadaire à gaz', 'Lampadaire LED'],
    desc: 'Éclaire la nuit.',
    joy: [0.2, 0.2, 0.2, 0.2, 0.2],
  },
};

export const KIND_ORDER: KindId[] = ['house', 'farm', 'well', 'workshop', 'gather', 'temple', 'mill', 'landmark', 'lamp'];

export interface AgeDef {
  name: string;
  tagline: string;
  /** Prérequis pour ATTEINDRE cet âge */
  reqPop: number;
  reqKinds: Partial<Record<KindId, number>>;
}

export const AGES: AgeDef[] = [
  { name: 'Préhistoire', tagline: 'Feux de camp et huttes', reqPop: 0, reqKinds: {} },
  { name: 'Antiquité', tagline: 'Cabanes, temples et agoras', reqPop: 12, reqKinds: { house: 4, farm: 1, well: 1, workshop: 1 } },
  { name: 'Médiéval', tagline: 'Colombages, églises et châteaux', reqPop: 30, reqKinds: { house: 8, temple: 1, workshop: 2, gather: 1 } },
  { name: 'Industriel', tagline: 'Briques, cheminées et gares', reqPop: 60, reqKinds: { house: 12, temple: 1, mill: 1, landmark: 1, gather: 2 } },
  { name: 'Moderne', tagline: 'Tours, éoliennes et parcs', reqPop: 110, reqKinds: { house: 18, mill: 2, landmark: 1, gather: 3, farm: 2 } },
];

export const KIND_LABEL: Record<KindId, string> = {
  house: 'maisons', farm: 'fermes', well: 'puits', workshop: 'ateliers', gather: 'lieux de rencontre',
  temple: 'lieux de culte', mill: 'moulins/usines', landmark: 'bâtiments majeurs', lamp: 'lampadaires',
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
