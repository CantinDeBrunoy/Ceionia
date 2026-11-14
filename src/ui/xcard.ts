// La carte d'explication du bas, à droite du menu Bâtir : la même au village (fiche du bâtiment survolé, en main ou choisi)
// et sur la barre de bataille (bâtiment ou recrue survolés). Ce module ne fait que la placer, sans rien chevaucher.

/** Largeur voulue de la carte, et la plus petite place libre où elle se pose à côté du menu */
const WANT = 360, MIN_SIDE = 290;

/**
 * Place la carte (en `position: fixed`) :
 * - dans la place libre entre le menu et le coin de droite (aide, mini-carte…), son bas sur celui du menu, quand elle y tient ;
 * - sinon au-dessus du coin de droite, calée sur son bord droit ;
 * - au téléphone (≤ 600 px), sur toute la largeur, au-dessus de la barre du bas.
 * `top` est la limite haute (le bas des panneaux du haut) : la carte défile plutôt que de passer dessous
 */
export function placeCard(card: HTMLElement, menu: Element | null, corner: Element | null, top: number) {
  if (!menu || !corner) return;
  const m = menu.getBoundingClientRect(), c = corner.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  if (!m.width || !c.width) return;
  const free = c.left - m.right - 24;
  let left: number, width: number, bottom: number, at: string;
  if (vw <= 600) {
    width = vw - 16; left = 8; bottom = vh - Math.min(m.top, c.top) + 8; at = 'phone';
  } else if (free >= MIN_SIDE) {
    width = Math.min(WANT, free); left = m.right + 12; bottom = vh - m.bottom; at = 'side';
  } else {
    // (au-dessus du coin ; si elle déborde au-dessus du menu, au-dessus du menu aussi)
    width = Math.min(WANT, vw - 24); left = Math.max(12, Math.min(c.right, vw - 12) - width);
    bottom = vh - (left < m.right ? Math.min(c.top, m.top) : c.top) + 10; at = 'above';
  }
  const maxH = Math.max(120, vh - bottom - top - 10);
  const st = card.style, px = (n: number) => `${Math.round(n)}px`;
  if (st.left !== px(left)) st.left = px(left);
  if (st.width !== px(width)) st.width = px(width);
  if (st.bottom !== px(bottom)) st.bottom = px(bottom);
  if (st.maxHeight !== px(maxH)) st.maxHeight = px(maxH);
  if (card.dataset.at !== at) card.dataset.at = at;
}

/** Échappe un texte pour un attribut HTML */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Les données de la carte portées par une tuile de la barre de bataille : nom, sous-titre (rôle, famille), texte, coût,
 * raison du refus. La carte les lit au survol (`data-x*`) ; le nom va aussi dans `aria-label`
 */
export function cardData(name: string, sub = '', desc = '', cost = '', why = '') {
  return `aria-label="${attr(name)}" data-xn="${attr(name)}" data-xs="${attr(sub)}" data-xd="${attr(desc)}" data-xc="${attr(cost)}" data-xw="${attr(why)}"`;
}
