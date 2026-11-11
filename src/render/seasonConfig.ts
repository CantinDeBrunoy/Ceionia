/**
 * Fiche de chaque saison : toutes les teintes, densités et réglages saisonniers du décor, réunis ici (sol, arbres, végétation
 * basse, eau, lumière, effets). Les couleurs s'écrivent '#rrggbb' ; couleurs et nombres s'interpolent d'une saison à la
 * suivante pendant la transition (season.ts), ce qui permet d'ajuster chaque saison indépendamment.
 *
 * Palettes : quatre teintes et la part de chacune. Chaque arbre (buisson, touffe, fleur) tire la sienne d'après sa place :
 * des voisins se ressemblent (bosquets de cerisiers, groupes d'érables rouges), sans motif régulier. La case 3 est celle des
 * « retardataires » (bourgeons clairs au printemps, arbres restés verts à l'automne) : une même place garde la même case
 * d'une saison à l'autre, et ses teintes passent de l'une à l'autre sans saut
 */

type Hex = `#${string}`;
/** Quatre teintes et la part de chacune (la somme fait 1) */
export interface PaletteDef { colors: readonly [Hex, Hex, Hex, Hex]; share: readonly [number, number, number, number] }

export interface SeasonDef {
  /** neige au sol (0 … 1 ; elle fond sur la fin de l'hiver, voir season.ts) */
  snow: number;
  /** feuillage des feuillus : 1 plein, 0,3 branches nues */
  leaf: number;
  /** hauteur des cultures (pousses, blé mûr, chaume, rien sous la neige) */
  growth: number;
  terrain: {
    /** herbe des prairies tempérées (les autres biomes en dérivent) */
    grass: Hex;
    /** grandes plaques du motif du sol : prairie claire, herbe sèche, herbe jaunie ; et leur force */
    patch: Hex; patchK: number;
    /** petites taches de terre apparente */
    soil: Hex; soilK: number;
    /** sol des forêts : mousse, ombre, tapis de feuilles mortes */
    litter: Hex; litterK: number;
    /** haut des berges et des grèves : herbe fraîche, mousse, feuilles, givre */
    bank: Hex; bankK: number;
    /** couleur des cultures */
    crop: Hex;
  };
  trees: {
    /** arbres à fleurs (cerisiers…) : fleurs au printemps, rouges à l'automne */
    blossom: PaletteDef;
    /** autres feuillus */
    leafy: PaletteDef;
    /** conifères (la neige se pose dessus à part) */
    conifer: PaletteDef;
    /** écart de feuillage d'un arbre à l'autre : certains se dénudent plus tôt, d'autres gardent des feuilles sèches l'hiver */
    leafSpread: number;
  };
  ground: {
    /** touffes d'herbe, et leur hauteur */
    tuft: PaletteDef; tuftHeight: number;
    /** buissons, et part de buissons fleuris */
    shrub: PaletteDef; shrubBloom: number;
    /** fleurs sauvages des prairies tempérées, et leur densité (1 = d'origine) */
    flowers: PaletteDef; flowerK: number;
    fern: Hex;
    /** chance de champignons au sol de la forêt ; tas de feuilles mortes */
    mushrooms: number; leafPiles: number;
    /** dessus des rochers : mousse ou feuilles (plus épais près de l'eau) ; la neige vient par-dessus */
    moss: Hex; mossK: number;
    /** berges : part des rives où poussent des roseaux, et leur teinte (vert frais, paille à l'automne) */
    bankReeds: number; reed: Hex;
  };
  water: {
    /** hauts-fonds et grand fond */
    shallow: Hex; deep: Hex;
    /** limpidité des hauts-fonds (plus haut : on voit mieux le fond) */
    clarity: number;
    /** reflet du ciel en incidence rasante ; rugosité (plus bas : reflets du soleil plus vifs) */
    sparkle: number; roughness: number;
    /** vitesse du courant (fonte des neiges au printemps, ralenti l'hiver) */
    flow: number;
    /** gel (0 … 1) : la glace part des rives, jamais là où le courant est fort ni sous les tropiques */
    ice: number;
    /** pétales ou feuilles qui dérivent au fil des rivières, et leur densité */
    float: Hex; floatK: number;
  };
  light: {
    /** soleil : teinte et force (1 = d'origine) */
    sun: Hex; sunK: number;
    /** teinte du ciel, et sa force */
    sky: Hex; skyK: number;
    /** lumière d'ambiance venue du ciel (elle teinte les ombres), sa part, et sa force */
    ambient: Hex; ambientMix: number; ambientK: number;
    /** lumière renvoyée par le sol */
    ground: Hex;
    /** portée du brouillard lointain (1 = d'origine) ; brume du matin et du soir */
    haze: number; mist: number;
  };
  fx: {
    /** pétales et feuilles qui tombent des arbres (par seconde, autour du point visé) ; dérive au vent */
    petals: number; leaves: number; wind: number;
    /** couleurs des feuilles qui tombent */
    leafColors: PaletteDef;
    /** quelques flocons dans l'air par temps clair */
    flurries: number;
  };
}

/** Neige au sol : éclairée sur les bosses, bleutée dans les creux */
export const SNOW_COLORS = { lit: '#E8EEF0' as Hex, shade: '#B8C9D5' as Hex, base: '#E2EAF0' as Hex };
/** Glace des rivières et des lacs */
export const ICE_COLOR: Hex = '#B8DCE8';
/** Pétales qui tombent des arbres fleuris */
export const PETAL_COLORS: Hex[] = ['#F6C6D8', '#FBE3EC', '#F1F0DB', '#E9A0B4'];

/** Proportions des essences (forêts tempérées) : elles ne changent pas avec les saisons */
export const SPECIES = {
  /** part des sapins parmi les feuillus (avec les modèles importés, sans eux) ; en taïga */
  pine: 0.32, pineProcedural: 0.38, pineTaiga: 0.92,
  /** part des arbres à fleurs parmi les feuillus, et à quel point ils se regroupent en bosquets (0 épars … 1 en massifs) */
  blossom: 0.4, blossomGroves: 0.75,
  /** part des feuillus d'un arbre isolé de prairie qui sont des sapins */
  lonePine: 0.35,
};

const pal = (colors: PaletteDef['colors'], share: PaletteDef['share']): PaletteDef => ({ colors, share });

/** Printemps : renouveau, fleurs, jeunes pousses, rivières vives */
const SPRING: SeasonDef = {
  snow: 0, leaf: 0.95, growth: 0.6,
  terrain: {
    grass: '#98C454', patch: '#BCDB72', patchK: 0.5, soil: '#8E7A58', soilK: 0.28,
    litter: '#7DA552', litterK: 0.25, bank: '#86B25A', bankK: 0.55, crop: '#B4DC86',
  },
  trees: {
    blossom: pal(['#E9A0B4', '#F1F0DB', '#F2BCCB', '#A8D66D'], [0.45, 0.3, 0.1, 0.15]),
    leafy: pal(['#A6D45A', '#8CC43E', '#74B03A', '#C0DD72'], [0.4, 0.25, 0.2, 0.15]),
    conifer: pal(['#5AA448', '#4C963F', '#68B050', '#529C44'], [0.4, 0.3, 0.15, 0.15]),
    leafSpread: 0.15,
  },
  ground: {
    tuft: pal(['#A2CF52', '#B4D865', '#C4DF78', '#8EC04C'], [0.4, 0.25, 0.2, 0.15]), tuftHeight: 1,
    shrub: pal(['#7DB458', '#8CC063', '#6FA850', '#9ACB6A'], [0.4, 0.25, 0.2, 0.15]), shrubBloom: 0.5,
    flowers: pal(['#E9A0B4', '#F1F0DB', '#F2D477', '#B79AD8'], [0.3, 0.3, 0.25, 0.15]), flowerK: 1.7,
    fern: '#9CCB55', mushrooms: 0.06, leafPiles: 0, moss: '#7EA650', mossK: 0.5, bankReeds: 0.3, reed: '#E4F5D2',
  },
  water: {
    shallow: '#8ED4C6', deep: '#2F7E94', clarity: 1, sparkle: 0.35, roughness: 0.1, flow: 1.4, ice: 0,
    float: '#F2BCCB', floatK: 0.5,
  },
  light: {
    sun: '#FFF0D6', sunK: 1.1, sky: '#E2F0FF', skyK: 0.1, ambient: '#DDEBFF', ambientMix: 0.35, ambientK: 1,
    ground: '#C9D79C', haze: 1, mist: 0.6,
  },
  fx: {
    petals: 18, leaves: 0, wind: 1, flurries: 0,
    leafColors: pal(['#A8D66D', '#7DB653', '#C2DD86', '#8FC45E'], [0.25, 0.25, 0.25, 0.25]),
  },
};

/** Été : végétation dense, verts soutenus, lumière chaude, eau lumineuse */
const SUMMER: SeasonDef = {
  snow: 0, leaf: 1, growth: 1,
  terrain: {
    grass: '#8CBC45', patch: '#BCCB5C', patchK: 0.36, soil: '#B09670', soilK: 0.18,
    litter: '#6E9A40', litterK: 0.3, bank: '#73A64A', bankK: 0.55, crop: '#E3CF6E',
  },
  trees: {
    blossom: pal(['#8CC43C', '#7AB534', '#9CCF46', '#A8D24E'], [0.3, 0.3, 0.2, 0.2]),
    leafy: pal(['#86C03A', '#72AE32', '#9ACC44', '#6AA42E'], [0.35, 0.3, 0.2, 0.15]),
    conifer: pal(['#4E9A3C', '#438C36', '#5CA844', '#3F8438'], [0.4, 0.3, 0.15, 0.15]),
    leafSpread: 0.1,
  },
  ground: {
    tuft: pal(['#9CC848', '#8CBC40', '#B2D45A', '#CCCF6A'], [0.4, 0.25, 0.2, 0.15]), tuftHeight: 1.2,
    shrub: pal(['#78B23E', '#68A238', '#86BE48', '#70AA3C'], [0.4, 0.25, 0.2, 0.15]), shrubBloom: 0.08,
    flowers: pal(['#F2D477', '#F1F0DB', '#E06A5A', '#8FA8E0'], [0.35, 0.3, 0.2, 0.15]), flowerK: 0.75,
    fern: '#88BE46', mushrooms: 0.1, leafPiles: 0, moss: '#6B9445', mossK: 0.42, bankReeds: 0.4, reed: '#FFFFFF',
  },
  water: {
    shallow: '#5FC2C2', deep: '#2A7899', clarity: 1.05, sparkle: 0.45, roughness: 0.06, flow: 1, ice: 0,
    float: '#7DB653', floatK: 0.04,
  },
  light: {
    sun: '#FFF2DA', sunK: 1.15, sky: '#D2E8FF', skyK: 0.08, ambient: '#D8E8FF', ambientMix: 0.35, ambientK: 0.95,
    ground: '#C8D396', haze: 1.1, mist: 0.3,
  },
  fx: {
    petals: 0, leaves: 1.5, wind: 0.8, flurries: 0,
    leafColors: pal(['#5D9B48', '#6FA850', '#7DB653', '#4E8A3E'], [0.25, 0.25, 0.25, 0.25]),
  },
};

/** Automne : feuillages colorés, feuilles mortes, couleurs chaudes, ambiance douce */
const AUTUMN: SeasonDef = {
  snow: 0.05, leaf: 0.9, growth: 0.45,
  terrain: {
    grass: '#939B4E', patch: '#A18E48', patchK: 0.6, soil: '#927D55', soilK: 0.32,
    litter: '#B0703E', litterK: 0.62, bank: '#9C7B48', bankK: 0.5, crop: '#C9A266',
  },
  trees: {
    blossom: pal(['#B95F52', '#D78B48', '#C8704A', '#D6B957'], [0.4, 0.3, 0.15, 0.15]),
    leafy: pal(['#D78B48', '#D6B957', '#B95F52', '#6E9A4A'], [0.35, 0.3, 0.15, 0.2]),
    conifer: pal(['#41835A', '#3A7852', '#4C8C60', '#45805A'], [0.4, 0.3, 0.15, 0.15]),
    leafSpread: 0.55,
  },
  ground: {
    tuft: pal(['#A18E48', '#B49A50', '#8F9A4C', '#C2A35A'], [0.4, 0.25, 0.2, 0.15]), tuftHeight: 0.85,
    shrub: pal(['#B95F52', '#C9783E', '#A8603A', '#8F8A48'], [0.35, 0.3, 0.2, 0.15]), shrubBloom: 0,
    flowers: pal(['#B79AD8', '#F1F0DB', '#E8C060', '#D99AB0'], [0.4, 0.3, 0.2, 0.1]), flowerK: 0.2,
    fern: '#B8874A', mushrooms: 0.4, leafPiles: 0.5, moss: '#B0753E', mossK: 0.38, bankReeds: 0.3, reed: '#F0D49C',
  },
  water: {
    shallow: '#6CA39A', deep: '#2F5F70', clarity: 0.8, sparkle: 0.22, roughness: 0.18, flow: 0.9, ice: 0,
    float: '#D78B48', floatK: 0.9,
  },
  light: {
    sun: '#FFDCB0', sunK: 0.92, sky: '#F2DEC8', skyK: 0.18, ambient: '#FFE2C4', ambientMix: 0.25, ambientK: 1.05,
    ground: '#D6B48C', haze: 0.9, mist: 0.8,
  },
  fx: {
    petals: 0, leaves: 34, wind: 1.8, flurries: 0,
    leafColors: pal(['#E0782C', '#D4A03A', '#C4532A', '#9A6A3A'], [0.3, 0.3, 0.25, 0.15]),
  },
};

/** Hiver : neige, glace, arbres dénudés, conifères enneigés, lumière froide */
const WINTER: SeasonDef = {
  snow: 1, leaf: 0.3, growth: 0.05,
  terrain: {
    grass: '#A7AD8E', patch: '#B8B49A', patchK: 0.3, soil: '#7E7466', soilK: 0.2,
    litter: '#8A7A62', litterK: 0.45, bank: '#C9D3D6', bankK: 0.4, crop: '#F1F5F9',
  },
  trees: {
    blossom: pal(['#A87850', '#B08A5A', '#946A48', '#B9956A'], [0.25, 0.25, 0.25, 0.25]),
    leafy: pal(['#A87850', '#B9956A', '#946A48', '#B08A5A'], [0.25, 0.25, 0.25, 0.25]),
    conifer: pal(['#4C8A4E', '#579455', '#62A05E', '#45804A'], [0.4, 0.3, 0.15, 0.15]),
    leafSpread: 0.5,
  },
  ground: {
    tuft: pal(['#B5AE94', '#A69F86', '#C8CCC4', '#9A9078'], [0.35, 0.25, 0.25, 0.15]), tuftHeight: 0.6,
    shrub: pal(['#7A6A58', '#857560', '#6E6252', '#8A7A66'], [0.3, 0.3, 0.2, 0.2]), shrubBloom: 0,
    flowers: pal(['#B79AD8', '#F1F0DB', '#E8C060', '#D99AB0'], [0.4, 0.3, 0.2, 0.1]), flowerK: 0,
    fern: '#8C7A5E', mushrooms: 0, leafPiles: 0, moss: '#8A8F7A', mossK: 0.15, bankReeds: 0.15, reed: '#E2D8C4',
  },
  water: {
    shallow: '#97BCD4', deep: '#3C6680', clarity: 0.9, sparkle: 0.3, roughness: 0.12, flow: 0.55, ice: 1,
    float: '#D78B48', floatK: 0,
  },
  light: {
    sun: '#EEF2FF', sunK: 0.95, sky: '#E2E8F0', skyK: 0.22, ambient: '#D0DEF2', ambientMix: 0.28, ambientK: 1.06,
    ground: '#B4C4D8', haze: 0.85, mist: 0.45,
  },
  fx: {
    petals: 0, leaves: 0, wind: 1.2, flurries: 1,
    leafColors: pal(['#8C6E52', '#9A7C5A', '#7E6A58', '#A08866'], [0.25, 0.25, 0.25, 0.25]),
  },
};

/** Les quatre saisons, dans l'ordre du temps de jeu (0 printemps, 1 été, 2 automne, 3 hiver) */
export const SEASONS: readonly SeasonDef[] = [SPRING, SUMMER, AUTUMN, WINTER];
