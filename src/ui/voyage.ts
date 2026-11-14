/**
 * L'écran d'attente de la cinématique « Explorer le monde » (voir `voyageCine.ts`) : la brume qui a couvert l'écran à la fin
 * de l'acte I, à l'identique, avec la silhouette du navire qui tangue et la brume qui passe. Elle tient pendant
 * l'agrandissement, le rechargement, la génération des îles et la préparation des shaders (`LoadingScreen` en mode
 * traversée), puis s'efface sur le voile de l'acte II, de la même couleur : aucune coupure
 */

/** Une caravelle en ombre chinoise (coque, trois mâts, voiles), sur fond transparent */
const SHIP = `<svg class="vyShip" viewBox="0 0 200 150" aria-hidden="true"><g fill="#5b6d76">
<path d="M18 104 L182 104 L166 128 Q100 138 34 128 Z"/><path d="M150 104 L176 92 L184 98 L170 106 Z"/>
<rect x="66" y="22" width="3" height="84"/><rect x="104" y="10" width="3.4" height="96"/><rect x="140" y="34" width="2.6" height="72"/>
<path d="M48 30 Q68 50 48 74 L88 74 Q96 52 88 30 Z"/><path d="M84 18 Q106 44 84 78 L128 78 Q136 48 128 18 Z"/>
<path d="M143 40 L170 86 L143 86 Z"/><path d="M106 6 L124 12 L106 16 Z"/></g></svg>`;

/** La brume et le navire (styles « La traversée » de `style.css`) */
export const VOYAGE_PLATE = `<div class="vyPlate" aria-hidden="true"><i class="vyMist m0"></i>${SHIP}<i class="vyMist m1"></i><i class="vyMist m2"></i></div>`;
