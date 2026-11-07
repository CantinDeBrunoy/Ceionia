/**
 * Raccourcis de texte pour la fiche d'un bâtiment : elle ne montre d'abord que l'essentiel, le reste se déplie
 */

/**
 * Coupe un texte en un début court (une phrase, ou un morceau de phrase d'au plus `max` signes) et sa suite.
 * La suite est vide quand le texte tient en entier ; un début coupé au milieu d'une phrase finit par « … ».
 */
export function brief(text: string, max = 120): [string, string] {
  const t = text.trim();
  if (t.length <= max) return [t, ''];
  // la première phrase, si elle n'est pas trop longue
  const m = /^.+?[.!?](?=\s+\S)/.exec(t);
  if (m && m[0].length <= max) return [m[0], t.slice(m[0].length).trim()];
  // sinon un morceau de phrase : on coupe à un deux-points, un point-virgule, puis une virgule, et au pire à un espace
  const head = t.slice(0, max);
  for (const sep of [' : ', ' ; ', ', ', ' ']) {
    const i = head.lastIndexOf(sep);
    if (i >= max / 3) return [`${t.slice(0, i)}…`, `…${t.slice(i + sep.length)}`];
  }
  return [`${head}…`, `…${t.slice(max)}`];
}

/**
 * Nom court d'un arrêt pour une ligne de la fiche : sans le mot « Gare » ni sa préposition (« Gare à grande vitesse 2 » →
 * « Grande vitesse 2 », « Gare intermodale » → « Intermodale ») ; « Petite gare » ou « Avant-poste » restent tels quels
 */
export function shortStop(name: string): string {
  const s = name.replace(/^Gare\s+(?:(?:à|de|du|des)\s+)?/i, '');
  return s === name || !s ? name : s[0].toUpperCase() + s.slice(1);
}
