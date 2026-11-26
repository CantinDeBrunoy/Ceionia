/**
 * L'icône du bâton du fondateur (frise des Enfers, écran de la victoire) : un bâton de bois noueux, la tête liée de cuir, deux
 * plumes et la pierre bleue du sommet, comme le modèle de la place (`render/founderStaff.ts`). Dessinée en SVG : pas de picto peint
 */
export function staffIcon(size = 20, cls = ''): string {
  return `<svg class="staffIc${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M9 30 L20 9" stroke="#3a2416" stroke-width="5" stroke-linecap="round"/>
    <path d="M9 30 L20 9" stroke="#9a6a3c" stroke-width="3" stroke-linecap="round"/>
    <path d="M13.2 22 l2.2 1.2 M15.6 17.4 l2.2 1.2" stroke="#5a3a22" stroke-width="1.4"/>
    <path d="M18 12.4 l3 1.6 M18.8 10.8 l3 1.6" stroke="#c8402a" stroke-width="2"/>
    <path d="M21 9 C26 7 28 11 25 15 C24 12 22.5 11 21 11Z" fill="#f2ead8" stroke="#3a2416" stroke-width="0.8"/>
    <path d="M19.5 9.6 C17 5 19 2.5 22 3.5 C21 5.5 20.6 7.5 21.2 9.4Z" fill="#d89a3a" stroke="#3a2416" stroke-width="0.8"/>
    <circle cx="21.6" cy="7.4" r="3" fill="#3aa8e8" stroke="#1a2a4a" stroke-width="1"/>
    <circle cx="20.7" cy="6.5" r="0.9" fill="#d8f2ff"/>
  </svg>`;
}
