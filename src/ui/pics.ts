/**
 * Pictos 3D en couleur à la place des émojis (dont le rendu varie selon le système) : le jeu d'icônes de Ceionia,
 * low-poly 3D comme l'équipement, en WebP 128 px dans `public/icons/pics/`.
 * `pic(émoji)` rend l'image ; un émoji absent de la table reste en texte. Pour en ajouter : une image carrée sur fond
 * transparent, réduite en WebP 128 px, et une ligne ici
 */

/** émoji (sans sélecteur de variante U+FE0F) → nom du fichier */
const PICS: Record<string, string> = {
  '🔥': 'fire',
  '⛔': 'no_entry',
  '🐑': 'ewe',
  '🍇': 'grapes',
  '⛏': 'pick',
  '🍯': 'honey_pot',
  '🐘': 'elephant',
  '🌾': 'sheaf_of_rice',
  '🐎': 'horse',
  '🐟': 'fish',
  '♨': 'hot_springs',
  '🥊': 'boxing_glove',
  '🐙': 'octopus',
  '🌀': 'cyclone',
  '🦈': 'shark',
  '⚒': 'hammer_and_pick',
  '🐺': 'wolf',
  '🎪': 'circus_tent',
  '🍺': 'beer_mug',
  '🐉': 'dragon',
  '⛵': 'sailboat',
  '🌶': 'hot_pepper',
  '🚂': 'locomotive',
  '🏭': 'factory',
  '🚗': 'automobile',
  '🎈': 'balloon',
  '🛢': 'oil_drum',
  '💰': 'money_bag',
  '🏔': 'snow-capped_mountain',
  '🐠': 'tropical_fish',
  '🔭': 'telescope',
  '🏅': 'sports_medal',
  '🎣': 'fishing_pole',
  '🏝': 'desert_island',
  '🚀': 'rocket',
  '🌕': 'full_moon',
  '🪐': 'ringed_planet',
  '🍞': 'bread',
  '🐖': 'pig',
  '🤕': 'face_with_head-bandage',
  '🐄': 'cow',
  '😊': 'smiling_face_with_smiling_eyes',
  '🔨': 'hammer',
  '⭐': 'star',
  '✨': 'sparkles',
  '⚔': 'crossed_swords',
  '★': 'star',
  // HUD en jeu : stocks, besoins, saisons, conseils, modes et rayons de la barre de construction
  '🪵': 'wood',
  '🪨': 'rock',
  '🧱': 'brick',
  '⛽': 'fuel_pump',
  '💧': 'droplet',
  '🏠': 'house',
  '❤': 'red_heart',
  '🛡': 'shield',
  '👥': 'busts_in_silhouette',
  '🌸': 'cherry_blossom',
  '☀': 'sun',
  '🍂': 'fallen_leaf',
  '❄': 'snowflake',
  '⚠': 'warning',
  '⬆': 'up_arrow',
  '✅': 'check_mark_button',
  '⛰': 'mountain',
  '🌳': 'deciduous_tree',
  '🏛': 'classical_building',
  '🎭': 'performing_arts',
  '🏥': 'hospital',
  '🧭': 'compass',
  '🌙': 'crescent_moon',
  '💼': 'briefcase',
  '🔔': 'bell',
  // la carte du village : un picto par âge
  '🦣': 'mammoth',
  '🏰': 'castle',
  '🏙': 'cityscape',
  // dangers des expéditions
  '🧗': 'danger_fall',
  '🌊': 'danger_water',
  '🌑': 'danger_dark',
  '⛈': 'danger_storm',
  '👹': 'danger_monster',
  // panneaux : rail, atelier, verrous, royaume, guerre
  '📦': 'freight',
  '🧳': 'passengers',
  '⚡': 'boost',
  '⏳': 'hourglass',
  '🔒': 'lock',
  '👑': 'crown',
  '🏆': 'trophy',
  '🌿': 'herb',
  '🎯': 'target',
  '🩹': 'bandage',
  '🛠': 'tools',
  '🎺': 'horn',
  '🌲': 'pine',
  '📷': 'camera',
  // troupes
  '🏹': 'bow',
  '🪓': 'axe',
  '💂': 'guard',
  '🪖': 'helmet',
  '🔫': 'gun',
  '🦾': 'mech_arm',
  '🤖': 'robot',
  '🚜': 'tank',
  '🛸': 'ufo',
  '☄': 'comet',
};

const key = (emoji: string) => emoji.replace(/️/g, '');

/** Le picto d'un émoji, à la taille `size` (px) ; l'émoji en texte s'il n'a pas de picto */
export function pic(emoji: string, size = 20, cls = ''): string {
  const f = PICS[key(emoji)];
  if (!f) return emoji;
  return `<img class="pic${cls ? ' ' + cls : ''}" src="./icons/pics/${f}.webp" width="${size}" height="${size}" alt="${emoji}" draggable="false" decoding="async">`;
}

/** Vrai si l'émoji a un picto */
export const hasPic = (emoji: string) => !!PICS[key(emoji)];

/** L'émoji en tête d'un texte, s'il a un picto, et la suite (sans l'espace qui suit) ; sinon null */
export function leadPic(text: string): [string, string] | null {
  const m = /^(\p{Extended_Pictographic}️?)\s*/u.exec(text);
  return m && hasPic(m[1]) ? [m[1], text.slice(m[0].length)] : null;
}

/** Un bout de HTML dont l'émoji de tête devient un picto (« 🔒 Portail fermé ») ; inchangé sinon */
export function withPic(html: string, size = 18): string {
  const l = leadPic(html);
  return l ? `${pic(l[0], size)} ${l[1]}` : html;
}
