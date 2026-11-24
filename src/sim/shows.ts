import { KINDS, sizeOf, type Building, type KindId } from '../build/catalog';
import { tr, localize } from '../i18n';

/**
 * Les gestes des bâtiments (« Lancer un match », « Organiser une course », « Tirer le feu d'artifice ») : un bouton sur la fiche, le village qui vient,
 * un spectacle sur le bâtiment, puis une récompense et un délai. Ici, les règles seules : lequel se lance où, quand on peut le
 * refaire, ce qu'il rapporte. La mise en scène est dans `src/shows.ts` et `src/render/shows/`
 */
export type ShowId = 'match' | 'race' | 'fireworks';

export interface ShowDef {
  id: ShowId;
  /** le bâtiment où il se tient */
  kind: KindId;
  /** son icône et le texte du bouton */
  icon: string;
  act: string;
  /** ce que dit la fiche pendant qu'il a lieu */
  running: string;
  /** délai avant de pouvoir le refaire, en jours de jeu (compté pour tout le village) */
  cooldown: number;
  /** bien-être pour un temps : part du bien-être du bâtiment à son âge, et pour combien de jours */
  joyK: number;
  joyDays: number;
  /** habitants qui viennent en spectateurs (au plus), parmi ceux qui sont libres */
  fans: number;
  /** nouveaux habitants attirés par la fête (s'il reste de la place) */
  newcomers: number;
  /** pas sous une forte pluie */
  dry: boolean;
  /** les spectateurs regardent de dehors, autour du bâtiment (au lieu d'y entrer) */
  watch?: boolean;
  /** explication du bouton (info-bulle) */
  tip: string;
}

export const SHOWS: ShowDef[] = [
  {
    id: 'match', kind: 'football', icon: '⚽', act: 'Lancer un match', running: 'Match en cours', cooldown: 1, joyK: 1, joyDays: 2, fans: 12, newcomers: 2, dry: true,
    tip: 'Les supporters viennent des maisons, les deux équipes entrent sur la pelouse. Bien-être pour deux jours, plus fort si le village gagne. Une victoire attire de nouveaux habitants.',
  },
  {
    id: 'race', kind: 'stadium', icon: '🏃', act: 'Organiser une course', running: 'Course en cours', cooldown: 1, joyK: 0.8, joyDays: 1.5, fans: 10, newcomers: 0, dry: true,
    tip: 'Six coureurs sur la ligne, le coup de pistolet, le sprint, le podium. Bien-être pour un jour et demi, le double si le record du village tombe.',
  },
  {
    id: 'fireworks', kind: 'funfair', icon: '🎆', act: 'Tirer le feu d’artifice', running: 'Feu d’artifice en cours', cooldown: 3, joyK: 0.8, joyDays: 1, fans: 12, newcomers: 3, dry: false, watch: true,
    tip: 'La foule se masse autour du parc pour le grand feu d’artifice, plus beau la nuit. Beaucoup de bien-être pour un jour, et la fête attire de nouveaux habitants.',
  },
];

export const showOf = (kind: KindId) => SHOWS.find((s) => s.kind === kind);
export const showDef = (id: ShowId) => SHOWS.find((s) => s.id === id)!;

/** Ce que le village garde des gestes (sauvegardé) : quand chacun se refait, le bien-être en cours, le record de la course */
export interface ShowState {
  /** heure (`exp.clock`, secondes de jeu) où le geste se refait */
  next: Partial<Record<ShowId, number>>;
  /** bien-être en cours, jusqu'à l'heure `until` ; un seul par geste (le refaire le remplace, il ne s'additionne pas) */
  boost: { id: ShowId; n: number; until: number }[];
  /** le record de la course du village (secondes), s'il y en a un */
  record?: number;
}

export const newShowState = (): ShowState => ({ next: {}, boost: [] });

const IDS = new Set<string>(SHOWS.map((s) => s.id));
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

/** Relu d'une sauvegarde (absent des anciennes : rien en cours) */
export function readShowState(d: any): ShowState {
  const s = newShowState();
  if (!d || typeof d !== 'object') return s;
  if (d.next && typeof d.next === 'object') for (const [k, v] of Object.entries(d.next)) if (IDS.has(k) && num(v) !== null) s.next[k as ShowId] = v as number;
  if (Array.isArray(d.boost)) for (const b of d.boost) if (b && IDS.has(b.id) && num(b.n) !== null && num(b.until) !== null) s.boost.push({ id: b.id, n: b.n, until: b.until });
  if (num(d.record) !== null && d.record > 0) s.record = d.record;
  return s;
}

/** À sauvegarder ? (rien en cours, pas de record : on n'écrit rien) */
export const showStateEmpty = (s: ShowState) => !Object.keys(s.next).length && !s.boost.length && !s.record;

/** Le bien-être des gestes encore en cours à l'heure `clock` */
export function showJoy(s: ShowState, clock: number) {
  let n = 0;
  for (const b of s.boost) if (b.until > clock) n += b.n;
  return n;
}

/** Secondes de jeu avant de pouvoir refaire ce geste (0 : prêt) */
export const showWait = (s: ShowState, id: ShowId, clock: number) => Math.max(0, (s.next[id] ?? 0) - clock);

/** Le bâtiment a-t-il un geste à son âge ? (un stade d'athlétisme réduit d'une ancienne partie en a un aussi) */
export function showFor(b: Building) {
  const d = showOf(b.kind);
  return d && b.age >= KINDS[b.kind].minAge ? d : undefined;
}

/** Ce qui empêche de lancer le geste maintenant (texte de la fiche), ou null */
export function showBlock(s: ShowState, d: ShowDef, clock: number, dayLen: number, ctx: { running: boolean; raining: boolean; away: boolean }) {
  if (ctx.running) return tr('Un autre spectacle a lieu au village');
  if (ctx.away) return tr('Revenez au village pour le lancer');
  const w = showWait(s, d.id, clock);
  if (w > 0) return tr('De nouveau possible dans {t}', { t: waitLabel(w, dayLen) });
  if (d.dry && ctx.raining) return tr('Il pleut trop fort : on attend une éclaircie');
  return null;
}

/** « 1 jour », « 6 h » : le temps qu'il reste, en jours et heures de jeu */
export function waitLabel(sec: number, dayLen: number) {
  const h = Math.ceil((sec / dayLen) * 24);
  if (h < 24) return tr('{n} h', { n: Math.max(1, h) });
  const d = Math.floor(h / 24), r = h - d * 24;
  return r ? tr('{d} j {h} h', { d, h: r }) : tr(d > 1 ? '{n} jours' : '{n} jour', { n: d });
}

/** Le geste vient d'être lancé : il ne se refera pas avant son délai */
export function showStarted(s: ShowState, d: ShowDef, clock: number, dayLen: number) {
  s.next[d.id] = clock + d.cooldown * dayLen;
}

/**
 * Le bien-être que rapporte le geste, sur ce bâtiment : la part `joyK` de son bien-être à son âge, ×`k` (une victoire, un
 * record), au moins 2
 */
export function showJoyFor(d: ShowDef, b: Pick<Building, 'kind' | 'age'>, k = 1) {
  const a = Math.max(b.age, KINDS[b.kind].minAge), base = KINDS[b.kind].joy?.[a] ?? 0;
  return Math.max(2, Math.round(base * d.joyK * k));
}

/** Le geste est fini : son bien-être (qui remplace celui d'un geste semblable encore en cours) */
export function showReward(s: ShowState, d: ShowDef, n: number, clock: number, dayLen: number) {
  s.boost = s.boost.filter((b) => b.id !== d.id && b.until > clock);
  s.boost.push({ id: d.id, n, until: clock + d.joyDays * dayLen });
}

/** Combien de nouveaux habitants la fête peut faire venir (le village doit garder une place libre, `cap > pop`) */
export function showRoom(want: number, pop: number, cap: number) {
  return Math.max(0, Math.min(want, Math.ceil(cap - pop) - 1));
}

/** La taille du bâtiment, pour l'échelle de la scène (un plan réduit sur 2 × 2) */
export const showScale = (b: Building) => (sizeOf(b) >= 3 ? 1 : 0.64);

// ---------------- Le match ----------------

/** Un match tiré d'une graine : les minutes des buts, de quel côté (0 : le village, 1 : les visiteurs) */
export interface MatchPlan { goals: { t: number; side: 0 | 1 }[]; score: [number, number] }

/** Durée du jeu (secondes de jeu, mi-temps comprises) ; le temps affiché va de 0 à 90 minutes */
export const MATCH_TIME = 70;

/**
 * Le déroulé d'un match : de 0 à 5 buts, jamais dans les premières secondes ni la toute fin, au moins 6 s entre deux, le
 * village un peu favori (55 %) ; `rnd` : un tirage de 0 à 1
 */
export function planMatch(rnd: () => number): MatchPlan {
  const n = [0, 1, 1, 2, 2, 2, 3, 3, 4, 5][Math.floor(rnd() * 10)];
  const goals: MatchPlan['goals'] = [];
  for (let i = 0; i < n; i++) {
    let t = 6 + rnd() * (MATCH_TIME - 12);
    for (let k = 0; k < 20 && goals.some((g) => Math.abs(g.t - t) < 6); k++) t = 6 + rnd() * (MATCH_TIME - 12);
    if (goals.some((g) => Math.abs(g.t - t) < 6)) continue;
    goals.push({ t, side: rnd() < 0.55 ? 0 : 1 });
  }
  goals.sort((a, b) => a.t - b.t);
  const score: [number, number] = [0, 0];
  for (const g of goals) score[g.side]++;
  return { goals, score };
}

/** Le bien-être d'un match : ×1,5 si le village gagne, ×1 au nul, ×0,6 s'il perd (on est venu, on a chanté) */
export const matchK = (score: [number, number]) => (score[0] > score[1] ? 1.5 : score[0] === score[1] ? 1 : 0.6);

// ---------------- La course ----------------

/** Les temps de la course (secondes, un tour de piste, au centième), des six coureurs : de 44 à 52 s */
export function planRace(rnd: () => number, n = 6) {
  return Array.from({ length: n }, () => Math.round((44 + rnd() * 8) * 100) / 100);
}

/** Un record tombe-t-il ? (le meilleur temps de la première course en est un) */
export const raceRecord = (s: ShowState, best: number) => !s.record || best < s.record;

for (const d of SHOWS) localize(d, ['act', 'running', 'tip']);
