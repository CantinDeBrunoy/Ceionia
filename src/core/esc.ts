const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Un texte inséré dans du HTML (`innerHTML`), en contenu comme dans un attribut entre guillemets : les cinq caractères qui
 * comptent sont échappés. Pour tout ce qui vient du joueur ou d'une sauvegarde (nom de l'île, des champions) et pour les
 * bulles `title`
 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
