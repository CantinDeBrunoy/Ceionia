/**
 * Le joueur tape-t-il du texte ? Seuls les vrais champs de saisie (texte, recherche, nombre…), les zones de texte, les listes
 * et les éléments éditables gardent le clavier. Un curseur, une case à cocher ou un bouton radio n'y ont pas droit : après un
 * réglage du curseur « Taille du pinceau », ZQSD et les raccourcis ne marchaient plus (bug de l'auteur, 27 nov. 2026)
 */
const NO_TEXT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

export function isTyping(t: EventTarget | null): boolean {
  if (t instanceof HTMLInputElement) return !NO_TEXT.has(t.type);
  return t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}
