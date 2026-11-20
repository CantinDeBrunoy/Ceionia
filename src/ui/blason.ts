import { tr } from '../i18n';
import {
  Blason, BlasonColor, BLASON_COLORS, COLOR_KEYS, COLOR_NAME, EMBLEMS, EMBLEM_NAME, EMBLEM_PATH, EMBLEM_HOLE, SHAPES, SHAPE_NAME,
  emblemSvg, flagSvg, hex, randomBlason,
} from '../sim/blason';
import { ic } from './icons';
import { menuPop } from './ui';

/**
 * Un soldat de face aux couleurs du blason : casque et cotte de mailles d'acier (ils ne changent pas), tabard de la couleur
 * principale à l'emblème, bouclier, panache et ceinture de la couleur de l'emblème
 */
export function soldierSvg(bl: Blason, h = 170) {
  const A = hex(BLASON_COLORS[bl.a]), B = hex(BLASON_COLORS[bl.b]);
  const steel = '#9aa3ad', steelD = '#6b737c', skin = '#e7b98f', boot = '#4a3626';
  const hole = (fill: string) => (EMBLEM_HOLE[bl.e] ? `<path d="${EMBLEM_HOLE[bl.e]}" fill="${fill}"/>` : '');
  return `<svg viewBox="0 0 100 150" width="${(h * 100) / 150}" height="${h}" aria-hidden="true">
    <ellipse cx="50" cy="145" rx="30" ry="4" fill="rgba(60,40,20,.18)"/>
    <path d="M37 112 h10 v28 h-12 z M53 112 h10 l2 28 h-12 z" fill="#5d4a3a"/>
    <path d="M33 136 h15 v6 h-17 z M52 136 h15 l2 6 h-17 z" fill="${boot}"/>
    <path d="M28 52 Q50 44 72 52 L76 82 L24 82 Z" fill="${steel}"/>
    <path d="M20 54 L28 52 L26 86 L18 84 Z M80 54 L72 52 L74 86 L82 84 Z" fill="${steelD}"/>
    <circle cx="19" cy="88" r="4" fill="${skin}"/><circle cx="81" cy="88" r="4" fill="${skin}"/>
    <path d="M32 50 H68 L70 118 H30 Z" fill="${A}"/>
    <path d="M30 82 H70 V88 H30 Z" fill="${B}"/>
    <g transform="translate(37 56) scale(0.26)"><path d="${EMBLEM_PATH[bl.e]}" fill="${B}"/>${hole(A)}</g>
    <path d="M44 38 h12 v12 h-12 z" fill="${skin}"/>
    <path d="M36 32 Q36 14 50 14 Q64 14 64 32 V38 H36 Z" fill="${steel}"/>
    <path d="M38 28 H62 V34 H38 Z" fill="#3a3f46"/>
    <path d="M49 30 h2 v12 h-2 z" fill="${steelD}"/>
    <path d="M50 14 Q44 2 54 0 Q50 6 58 8 Q52 10 50 14 Z" fill="${B}"/>
    <path d="M84 40 V110" stroke="#6b4a2a" stroke-width="3"/><path d="M84 30 l4 12 h-8 z" fill="${steel}"/>
    <path d="M4 66 H32 V92 Q32 108 18 114 Q4 108 4 92 Z" fill="${A}" stroke="${B}" stroke-width="2.5"/>
    <g transform="translate(9 74) scale(0.18)"><path d="${EMBLEM_PATH[bl.e]}" fill="${B}"/>${hole(A)}</g>
  </svg>`;
}

/**
 * Le choix du blason du village : deux couleurs, un emblème, la forme du drapeau, avec l'aperçu du drapeau et d'un soldat.
 * `preview` est appelé à chaque changement (le village se teint aussitôt) ; à la fermeture, la promesse rend le blason
 * choisi, ou null si le joueur renonce (« Plus tard » au premier lancement, la croix ensuite : `preview` est alors rappelé
 * avec le blason de départ)
 */
export function chooseBlason(root: HTMLElement, cur: Blason, first = false, preview?: (b: Blason) => void): Promise<Blason | null> {
  return new Promise((resolve) => {
    const bl: Blason = { ...cur };
    let done: Blason | null = null;
    const swatch = (slot: 'a' | 'b', k: BlasonColor) =>
      `<button type="button" class="blSw" data-${slot}="${k}" title="${tr(COLOR_NAME[k])}" aria-label="${tr(COLOR_NAME[k])}" style="--c:${hex(BLASON_COLORS[k])}"><i></i></button>`;
    const { ov, close } = menuPop(root, 'blasonPick', 'options', tr('Le blason du village'), `
      <div class="blWrap">
        <div class="blShow"><div class="blFlag"></div><div class="blMan"></div></div>
        <div class="blPick">
          <h4>${tr('Couleur du champ')}</h4><div class="blRow">${COLOR_KEYS.map((k) => swatch('a', k)).join('')}</div>
          <h4>${tr('Couleur de l’emblème')}</h4><div class="blRow">${COLOR_KEYS.map((k) => swatch('b', k)).join('')}</div>
          <h4>${tr('Emblème')}</h4><div class="blRow blEmb">${EMBLEMS.map((e) => `<button type="button" data-e="${e}" title="${tr(EMBLEM_NAME[e])}" aria-label="${tr(EMBLEM_NAME[e])}">${emblemSvg(e, 'currentColor', 30, 'transparent')}</button>`).join('')}</div>
          <h4>${tr('Forme du drapeau')}</h4><div class="blRow blShape">${SHAPES.map((s) => `<button type="button" data-s="${s}">${tr(SHAPE_NAME[s])}</button>`).join('')}</div>
        </div>
      </div>
      <p class="hint">${tr('Il flotte sur vos tours, vos navires et vos bannières, et vos troupes en portent les couleurs. Vous pourrez le changer dans Paramètres › Partie.')}</p>
      <div class="popFoot"><button type="button" data-rand>${ic('dice', 16, 2)}${tr('Au hasard')}</button>${first ? `<button type="button" data-later>${tr('Plus tard')}</button>` : ''}<button type="button" data-r="1">${ic('check', 15, 2.2)}${tr('Valider')}</button></div>`,
    () => { if (!done) preview?.(cur); resolve(done); }, tr('Ses couleurs flottent sur vos drapeaux et habillent vos troupes.'));
    ov.style.zIndex = '40';
    const draw = () => {
      ov.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.a === bl.a)));
      ov.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.b === bl.b)); b.disabled = b.dataset.b === bl.a; });
      ov.querySelectorAll<HTMLButtonElement>('[data-e]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.e === bl.e)));
      ov.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === bl.s)));
      (ov.querySelector('.blFlag') as HTMLElement).innerHTML = flagSvg(bl, 210);
      (ov.querySelector('.blMan') as HTMLElement).innerHTML = soldierSvg(bl, 170);
      preview?.({ ...bl });
    };
    ov.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.a as BlasonColor;
      // la même teinte que l'emblème : ils échangent leurs couleurs
      if (k === bl.b) bl.b = bl.a;
      bl.a = k; draw();
    }));
    ov.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) => (b.onclick = () => { bl.b = b.dataset.b as BlasonColor; draw(); }));
    ov.querySelectorAll<HTMLButtonElement>('[data-e]').forEach((b) => (b.onclick = () => { bl.e = b.dataset.e as Blason['e']; draw(); }));
    ov.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => (b.onclick = () => { bl.s = b.dataset.s as Blason['s']; draw(); }));
    (ov.querySelector('[data-rand]') as HTMLButtonElement).onclick = () => { Object.assign(bl, randomBlason()); draw(); };
    const later = ov.querySelector('[data-later]') as HTMLButtonElement | null;
    if (later) later.onclick = () => close();
    (ov.querySelector('[data-r="1"]') as HTMLButtonElement).onclick = () => { done = { ...bl }; close(); };
    draw();
  });
}
