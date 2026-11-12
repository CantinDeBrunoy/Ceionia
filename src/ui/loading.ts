import { tr } from '../i18n';

/** L'emblème : une rose des vents dont le cercle enferme des montagnes et un lac */
const EMBLEM = `<svg class="ldEmblem" viewBox="0 0 120 120" aria-hidden="true">
  <path d="M60 2 L67 44 L60 40 L53 44 Z M60 118 L53 76 L60 80 L67 76 Z M2 60 L44 53 L40 60 L44 67 Z M118 60 L76 67 L80 60 L76 53 Z" fill="#1d2f5c"/>
  <path d="M60 2 L67 44 L60 40 Z M118 60 L76 67 L80 60 Z M60 118 L53 76 L60 80 Z M2 60 L44 53 L40 60 Z" fill="#3a5694"/>
  <path d="M28 28 L52 47 L47 52 Z M92 28 L73 52 L68 47 Z M92 92 L68 73 L73 68 Z M28 92 L47 68 L52 73 Z" fill="#1d2f5c"/>
  <circle cx="60" cy="60" r="30" fill="#eef4ff" stroke="#1d2f5c" stroke-width="5"/>
  <path d="M33 66 L48 47 L55 55 L64 41 L87 66 Z" fill="#1d2f5c"/>
  <path d="M64 41 L70 49 L66 48 L62 52 L59 48 Z M48 47 L52 52 L49 51 L46 53 Z" fill="#ffffff"/>
  <path d="M33 66 L87 66 Q84 78 76 84 L60 76 L44 84 Q36 78 33 66 Z" fill="#5d9be8"/>
  <path d="M60 76 L76 84 Q69 89 60 90 Q51 89 44 84 Z" fill="#3a7bd5"/>
</svg>`;

/** l'ampoule devant le conseil */
const BULB = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 5a5.5 5.5 0 0 0-3.3 9.9c.6.5.8 1.1.8 1.8v.3h5v-.3c0-.7.3-1.3.8-1.8A5.5 5.5 0 0 0 12 5z"/><path d="M12 1.5v1.2M4.6 4.6l.9.9M19.4 4.6l-.9.9M2.5 11h1.3M21.5 11h-1.3"/></svg>';

/** La vidéo du fond animé de l'accueil (dans public/menu/) ; vide : l'image fixe `fond.webp` sert seule */
export const MENU_VIDEO = 'fond.mp4';

/**
 * Le fond de l'accueil et du chargement, classe `cls` : la vidéo en boucle, sans le son, sur l'image fixe en attendant
 * qu'elle démarre ; l'image seule si `video` est faux (le chargement) ou si le système demande moins d'animations
 */
export function menuBg(cls: string, video = true): string {
  const still = !video || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return MENU_VIDEO && !still
    ? `<video class="${cls}" src="./menu/${MENU_VIDEO}" poster="./menu/fond.webp" muted loop autoplay playsinline preload="auto" disablepictureinpicture aria-hidden="true"></video>`
    : `<img class="${cls}" src="./menu/fond.webp" alt="" decoding="async">`;
}

/** Conseils montrés pendant le chargement, un à la fois (textes français, traduits à l'affichage) */
export const LOAD_TIPS = [
  'Planifiez bien vos constructions pour une ville prospère.',
  'Le village grandit quand ses besoins sont comblés : nourriture, eau, logement, travail.',
  'Clic droit pour tourner la vue, molette pour zoomer.',
  'R tourne le bâtiment que vous tenez en main.',
  'Les expéditions débloquent de nouveaux bâtiments.',
  'P : le mode photo, pour admirer votre village.',
  'Cliquez sur une condition de l’âge suivant pour trouver ce qui manque.',
  'Sculptez le relief, creusez des lacs, faites naître des montagnes.',
];
/** Temps d'affichage d'un conseil (ms) */
const TIP_MS = 4500;

/**
 * Écran de chargement : sur le paysage de l'accueil, voilé de clair au centre, l'emblème, le nom du jeu, l'étape en cours,
 * une barre et un conseil qui change. Il couvre la vue pendant le chargement des modèles et la préparation du monde
 * (construction, shaders du jour et de la nuit, premières images), puis s'efface en fondu : la partie tourne déjà dessous
 */
export class LoadingScreen {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private bar: HTMLElement;
  /** avancée affichée (la barre ne recule jamais) */
  private k = 0;
  private tipTimer = 0;

  constructor(root: HTMLElement) {
    const el = (this.el = document.createElement('div'));
    el.id = 'loadScreen';
    el.setAttribute('role', 'status');
    el.innerHTML = `${menuBg('ldBg', false)}<div class="ldBox">${EMBLEM}<h1>Ceionia</h1><p class="ldStep"></p><div class="ldBar"><i></i></div><p class="ldTip">${BULB}<span></span></p></div>`;
    this.label = el.querySelector('.ldStep')!;
    this.bar = el.querySelector('.ldBar i')!;
    // un conseil au hasard, puis le suivant toutes les quelques secondes
    const tip = el.querySelector<HTMLElement>('.ldTip span')!;
    let i = Math.floor(Math.random() * LOAD_TIPS.length);
    const show = () => { tip.textContent = tr(LOAD_TIPS[i % LOAD_TIPS.length]); i++; };
    show();
    this.tipTimer = window.setInterval(show, TIP_MS);
    root.appendChild(el);
  }

  /** Étape en cours (texte français, traduit ici ; `detail` ajouté tel quel) et avancée de la barre, de 0 à 1 */
  step(label: string, k: number, detail = '') {
    const text = detail ? `${tr(label)} ${detail}` : tr(label);
    if (this.label.textContent !== text) this.label.textContent = text;
    this.k = Math.max(this.k, Math.min(1, k));
    this.bar.style.width = `${Math.round(this.k * 1000) / 10}%`;
  }

  /** La scène est prête : l'écran s'efface en fondu, puis disparaît (`now` : tout de suite, sans fondu) */
  done(now = false) {
    clearInterval(this.tipTimer);
    if (now) { this.el.remove(); return; }
    this.k = 1;
    this.bar.style.width = '100%';
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 600);
  }
}

/** Attend que le navigateur ait affiché l'écran (avant un long calcul qui le figerait sans qu'on l'ait vu) */
export const painted = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
