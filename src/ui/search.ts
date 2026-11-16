/**
 * Recherche dans les listes (bâtiments du menu Bâtir, expéditions) : sans accents ni majuscules, dans les deux langues.
 * « eglise », « Église » et « church » trouvent la même vignette
 */

/** Texte ramené à sa forme de recherche : minuscules, sans accents, ligatures défaites, apostrophes unifiées */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[’‘`´]/g, "'").replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Les mots d'un texte replié (l'apostrophe sépare : « d'eau » donne « d » et « eau ») */
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Le texte répond-il à la recherche ? Chaque mot tapé doit commencer l'un des mots des textes (« bou » trouve
 * « Boulangerie », « eau » trouve « Point d'eau » mais pas « Château ») ; une recherche vide répond à tout
 */
export function matches(query: string, texts: readonly string[]): boolean {
  const q = words(query);
  if (!q.length) return true;
  const hay = texts.flatMap(words);
  return q.every((w) => hay.some((h) => h.startsWith(w)));
}
