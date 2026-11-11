/**
 * Pictos 3D en couleur à la place des émojis (dont le rendu varie selon le système) : le jeu Fluent Emoji de Microsoft
 * (licence MIT, https://github.com/microsoft/fluentui-emoji), en WebP 128 px dans `public/icons/fluent/`.
 * `pic(émoji)` rend l'image ; un émoji absent de la table reste en texte. Pour en ajouter : le PNG « 3D » du dossier
 * Fluent qui porte le nom de l'émoji, converti en WebP 128 px, et une ligne ici
 */

/** émoji (sans sélecteur de variante U+FE0F) → nom du fichier */
const FLUENT: Record<string, string> = {
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
};

/** Le picto d'un émoji, à la taille `size` (px) ; l'émoji en texte s'il n'a pas de picto */
export function pic(emoji: string, size = 20, cls = ''): string {
  const f = FLUENT[emoji.replace(/\uFE0F/g, '')];
  if (!f) return emoji;
  return `<img class="pic${cls ? ' ' + cls : ''}" src="./icons/fluent/${f}.webp" width="${size}" height="${size}" alt="${emoji}" draggable="false" decoding="async">`;
}

/** Vrai si l'émoji a un picto */
export const hasPic = (emoji: string) => !!FLUENT[emoji.replace(/\uFE0F/g, '')];
