/**
 * Le blason du village du joueur : deux couleurs (le champ du drapeau, l'emblème), un emblème et une forme de drapeau. Il
 * teint tous les drapeaux du joueur et les tissus de ses troupes (voir `render/teamPaint.ts`). Sauvé avec la partie
 * (`World.blason`) ; une ancienne partie prend `DEFAULT_BLASON`
 */

/** Les teintes proposées. Ni turquoise ni rouge laqué : ce sont les couleurs des Sablais et des Jadéens */
export const BLASON_COLORS = {
  azur: 0x2f5fa8,
  nuit: 0x22355c,
  pourpre: 0x6b3a8c,
  bordeaux: 0x7a2433,
  rouge: 0xb8342c,
  vert: 0x2e6b3f,
  ocre: 0xc07a2a,
  or: 0xe2b443,
  argent: 0xe8e4da,
  noir: 0x2b2a2e,
} as const;
export type BlasonColor = keyof typeof BLASON_COLORS;
export const COLOR_KEYS = Object.keys(BLASON_COLORS) as BlasonColor[];

/** Noms des teintes, à traduire au moment de l'affichage (`tr`) */
export const COLOR_NAME: Record<BlasonColor, string> = {
  azur: 'Azur', nuit: 'Bleu nuit', pourpre: 'Pourpre', bordeaux: 'Bordeaux', rouge: 'Gueules', vert: 'Sinople',
  ocre: 'Ocre', or: 'Or', argent: 'Argent', noir: 'Sable',
};

export const EMBLEMS = ['montagne', 'soleil', 'arbre', 'epis', 'etoile', 'vague', 'tour', 'couronne'] as const;
export type Emblem = (typeof EMBLEMS)[number];
export const EMBLEM_NAME: Record<Emblem, string> = {
  montagne: 'Montagne', soleil: 'Soleil', arbre: 'Arbre', epis: 'Épis', etoile: 'Étoile', vague: 'Vagues', tour: 'Tour', couronne: 'Couronne',
};

/** Forme du drapeau : droit, à queue d'aronde, en flamme (pointe) */
export const SHAPES = ['droit', 'aronde', 'flamme'] as const;
export type FlagShape = (typeof SHAPES)[number];
export const SHAPE_NAME: Record<FlagShape, string> = { droit: 'Droit', aronde: 'À queue d’aronde', flamme: 'En flamme' };

export interface Blason { a: BlasonColor; b: BlasonColor; e: Emblem; s: FlagShape }

/** Azur et or à la montagne, comme les sommets du titre du jeu */
export const DEFAULT_BLASON: Blason = { a: 'azur', b: 'or', e: 'montagne', s: 'droit' };

/** Relit un blason sauvé (absent, abîmé ou d'une ancienne version : le blason par défaut, champ par champ) */
export function readBlason(v: unknown): Blason {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Blason, unknown>>;
  const pick = <T extends string>(x: unknown, list: readonly T[], d: T): T => (list.includes(x as T) ? (x as T) : d);
  const a = pick(o.a, COLOR_KEYS, DEFAULT_BLASON.a);
  let b = pick(o.b, COLOR_KEYS, DEFAULT_BLASON.b);
  // deux fois la même teinte : l'emblème ne se verrait plus
  if (b === a) b = a === 'or' ? 'argent' : 'or';
  return { a, b, e: pick(o.e, EMBLEMS, DEFAULT_BLASON.e), s: pick(o.s, SHAPES, DEFAULT_BLASON.s) };
}

/** Un tirage au hasard (bouton « Au hasard » de la fenêtre) */
export function randomBlason(rnd = Math.random): Blason {
  const at = <T>(l: readonly T[]) => l[Math.floor(rnd() * l.length) % l.length];
  const a = at(COLOR_KEYS);
  // l'emblème clair sur un champ sombre et l'inverse, pour qu'il se lise de loin
  const light = (k: BlasonColor) => k === 'or' || k === 'argent' || k === 'ocre';
  const b = at(COLOR_KEYS.filter((k) => k !== a && light(k) !== light(a)));
  return { a, b, e: at(EMBLEMS), s: at(SHAPES) };
}

// ── les emblèmes, en tracés SVG dans un carré de 100 : les mêmes servent à la fenêtre (SVG) et à la texture des drapeaux
// (canvas, `Path2D`)
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const star = (cx: number, cy: number, ro: number, ri: number, n: number, rot = -Math.PI / 2) =>
  poly(Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]; }));
/** un grain d'épi : une amande penchée */
const grain = (x: number, y: number, side: number) => {
  const dx = side * 9, dy = -7;
  return `M${x} ${y} Q${x + dx * 0.2 + side * 6} ${y + dy * 0.1 + 3} ${x + dx} ${y + dy} Q${x + dx * 0.2 - side * 1} ${y + dy - 4} ${x} ${y} Z`;
};
const ear = (x: number, lean: number) => {
  let d = poly([[x - 1.6, 92], [x + 1.6, 92], [x + 1.6 + lean, 30], [x - 1.6 + lean, 30]]);
  for (let k = 0; k < 5; k++) { const y = 74 - k * 10, xx = x + (lean * (92 - y)) / 62; d += grain(xx, y, -1) + grain(xx, y, 1); }
  return d + grain(x + lean, 30, -0.4) ;
};

export const EMBLEM_PATH: Record<Emblem, string> = {
  montagne: poly([[6, 84], [36, 30], [47, 46], [62, 20], [94, 84]]),
  soleil: circle(50, 50, 19) + Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6, c = Math.cos(a), s = Math.sin(a), w = 0.16;
    return poly([[50 + Math.cos(a - w) * 24, 50 + Math.sin(a - w) * 24], [50 + c * 42, 50 + s * 42], [50 + Math.cos(a + w) * 24, 50 + Math.sin(a + w) * 24]]);
  }).join(''),
  arbre: poly([[44, 92], [56, 92], [55, 62], [45, 62]]) + circle(50, 38, 26) + circle(30, 52, 14) + circle(70, 52, 14),
  epis: ear(50, 0) + ear(32, -6) + ear(68, 6),
  etoile: star(50, 52, 44, 18, 5),
  vague: [24, 50, 76].map((y) => `M6 ${y} Q19 ${y - 14} 32 ${y} T58 ${y} T84 ${y} T96 ${y - 4} V${y + 9} Q90 ${y + 5} 84 ${y + 9} T58 ${y + 9} T32 ${y + 9} Q19 ${y - 5} 6 ${y + 9} Z`).join(''),
  tour: poly([[26, 92], [74, 92], [70, 36], [76, 36], [76, 16], [66, 16], [66, 24], [56, 24], [56, 16], [44, 16], [44, 24], [34, 24], [34, 16], [24, 16], [24, 36], [30, 36]]),
  couronne: poly([[16, 70], [10, 30], [32, 50], [50, 20], [68, 50], [90, 30], [84, 70]]) + poly([[16, 76], [84, 76], [84, 88], [16, 88]]),
};
/** L'ouverture des emblèmes (porte de la tour, fenêtre) : percée dans la couleur du champ */
export const EMBLEM_HOLE: Partial<Record<Emblem, string>> = {
  tour: `M43 92 V72 A7 7 0 0 1 57 72 V92 Z`,
};

/** Le contour du drapeau dans un rectangle de 100 × 66 (hampe à gauche) */
export const SHAPE_PATH: Record<FlagShape, string> = {
  droit: 'M0 0 H100 V66 H0 Z',
  aronde: 'M0 0 H100 L76 33 L100 66 H0 Z',
  flamme: 'M0 0 L100 24 L100 42 L0 66 Z',
};

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** L'emblème seul, en SVG (dans `size` pixels), de la couleur `fill` */
export function emblemSvg(e: Emblem, fill: string, size = 28, holeFill = 'none') {
  const hole = EMBLEM_HOLE[e] ? `<path d="${EMBLEM_HOLE[e]}" fill="${holeFill}"/>` : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path d="${EMBLEM_PATH[e]}" fill="${fill}" fill-rule="nonzero"/>${hole}</svg>`;
}

/** Le drapeau entier en SVG, comme il flotte en jeu : le champ découpé à sa forme, l'emblème au milieu (vers la hampe pour une forme découpée) */
export function flagSvg(bl: Blason, width = 160) {
  const A = hex(BLASON_COLORS[bl.a]), B = hex(BLASON_COLORS[bl.b]);
  // mêmes proportions que le shader (render/teamPaint.ts) : un carré de 0,74 de la hauteur, centré à 0,5 ou 0,42 de la longueur
  const side = 66 * 0.74, cx = bl.s === 'droit' ? 50 : 42, k = side / 100;
  const hole = EMBLEM_HOLE[bl.e] ? `<path d="${EMBLEM_HOLE[bl.e]}" fill="${A}"/>` : '';
  return `<svg viewBox="-2 -2 104 70" width="${width}" height="${(width * 70) / 104}" aria-hidden="true">
    <path d="${SHAPE_PATH[bl.s]}" fill="${A}" stroke="rgba(0,0,0,.2)" stroke-width="1" stroke-linejoin="round"/>
    <g transform="translate(${cx - side / 2} ${33 - side / 2}) scale(${k})"><path d="${EMBLEM_PATH[bl.e]}" fill="${B}"/>${hole}</g></svg>`;
}
