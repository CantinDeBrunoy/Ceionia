import { KINDS, KindId, lineOf } from '../build/catalog';
import type { Effect } from './missions';

/**
 * Petits objectifs entre les conditions d'âge (testeurs v6 : « après le tutoriel, je me suis senti lâché », « les 7 conditions,
 * c'est long »). Chaque âge a sa liste, dans l'ordre ; le jeu en montre trois à la fois dans la barre du haut. Un objectif
 * atteint donne une petite récompense (ressources, bien-être de quelques jours) et un mot de félicitation, puis le suivant
 * prend sa place. Ici, les règles seules (pas de DOM) : `Game` les fait avancer, `UI` les montre
 */

/** Ce que le jeu sait du village, lu à chaque vérification */
export interface GoalCtx {
  age: number;
  pop: number;
  /** jours écoulés depuis le début de la partie (entier) */
  day: number;
  /** 0 printemps, 1 été, 2 automne, 3 hiver */
  season: number;
  /** bâtiments par sorte (`Sim.counts`) */
  counts: Record<string, number>;
  /** besoins comblés */
  ok: { food: boolean; water: boolean; jobs: boolean; joy: boolean; health: boolean; housing: boolean };
  /** part des habitations couvertes par les secours (0 … 1) */
  security: number;
  brick: number;
  /** expéditions réussies (identifiants) */
  missions: readonly string[];
  /** ressources illimitées (bac à sable, ou réglage « Ressources » en Facile) : pas de récompense, pas d'objectif de stock */
  unlimited?: boolean;
  /** l'hiver éteint par le joueur (Paramètres › Saisons jouées) : « Passer votre premier hiver » ne se propose pas */
  noWinter?: boolean;
}

export interface GoalReward { wood?: number; stone?: number; ore?: number; /** bien-être en plus, pendant quelques jours */ joy?: { n: number; days: number } }

/** Comment l'objectif se mesure : un état du village, une série de jours, un hiver passé, ou des événements comptés */
type Measure =
  | { t: 'state'; f: (c: GoalCtx) => [number, number] }
  | { t: 'streak'; days: number; f: (c: GoalCtx) => boolean }
  | { t: 'winter' }
  | { t: 'event'; ev: GoalEvent };

/** Les événements que le jeu signale (`Goals.note`) : une expédition réussie sans blessé, une expédition légendaire réussie */
export type GoalEvent = 'safeExp' | 'legend';

export interface GoalDef {
  id: string;
  age: number;
  text: string;
  /** le mot de félicitation */
  praise: string;
  /** picto du HUD (`hudPic`) ; à défaut, celui du premier bâtiment de `kinds` */
  pic?: string;
  /** bâtiments qui le remplissent : un clic sur l'objectif prend le premier en main ; fermés par une expédition, l'objectif attend */
  kinds?: KindId[];
  /** un clic ouvre les expéditions */
  exp?: boolean;
  /** demande un stock en réserve : ne veut rien dire quand les ressources sont illimitées (bac à sable), il n'est pas proposé */
  stock?: boolean;
  measure: Measure;
  reward: GoalReward;
}

/** Combien de bâtiments de ces sortes (un bâtiment amélioré compte encore pour son genre d'origine) */
const countOf = (c: GoalCtx, ks: KindId[]) => {
  const all = new Set(ks.flatMap((k) => lineOf(k)));
  let n = 0;
  for (const k of all) n += c.counts[k] ?? 0;
  return n;
};
const pop = (n: number) => (c: GoalCtx): [number, number] => [Math.floor(c.pop), n];
const build = (ks: KindId[], n = 1) => (c: GoalCtx): [number, number] => [countOf(c, ks), n];
const allOk = (c: GoalCtx) => c.ok.food && c.ok.water && c.ok.jobs && c.ok.joy && c.ok.health && c.ok.housing;
// (sans maison, la part protégée vaut 100 % : elle ne compte qu'à partir d'une maison, sinon l'objectif tombait dès le départ)
const sec = (p: number) => (c: GoalCtx): [number, number] => [countOf(c, ['house']) ? Math.floor(c.security * 100 + 1e-6) : 0, p];

export const GOALS: GoalDef[] = [
  // ---- Préhistoire
  { id: 'p-pop12', age: 0, pic: 'logement', kinds: ['house'], text: 'Loger 12 habitants', praise: 'Le camp s’agrandit !', measure: { t: 'state', f: pop(12) }, reward: { stone: 25 } },
  { id: 'p-fed', age: 0, pic: 'nourriture', kinds: ['farm'], text: 'Nourrir et abreuver tout le village 3 jours de suite', praise: 'Personne n’a eu faim ni soif.', measure: { t: 'streak', days: 3, f: (c) => c.ok.food && c.ok.water }, reward: { wood: 30 } },
  { id: 'p-exp', age: 0, pic: 'boussole', exp: true, text: 'Réussir une première expédition', praise: 'L’équipe rentre en héros.', measure: { t: 'state', f: (c) => [Math.min(1, c.missions.length), 1] }, reward: { stone: 15, joy: { n: 1, days: 4 } } },
  { id: 'p-winter', age: 0, pic: 'hiver', text: 'Passer votre premier hiver', praise: 'Le printemps revient : le village a tenu bon.', measure: { t: 'winter' }, reward: { wood: 30, joy: { n: 2, days: 4 } } },
  { id: 'p-lamp', age: 0, kinds: ['lamp'], text: 'Éclairer le village : 3 torches', praise: 'Le village brille dans la nuit.', measure: { t: 'state', f: build(['lamp'], 3) }, reward: { wood: 20 } },
  { id: 'p-pen', age: 0, kinds: ['pen'], text: 'Un enclos pour les bêtes', praise: 'Les bêtes ont leur enclos.', measure: { t: 'state', f: build(['pen']) }, reward: { wood: 20 } },
  // ---- Antiquité
  { id: 'a-pop24', age: 1, pic: 'logement', kinds: ['house'], text: 'Loger 24 habitants', praise: 'Le village devient une petite ville.', measure: { t: 'state', f: pop(24) }, reward: { stone: 40 } },
  { id: 'a-safe', age: 1, pic: 'boussole', exp: true, text: 'Réussir une expédition sans blessé', praise: 'Tout le monde est rentré sain et sauf.', measure: { t: 'event', ev: 'safeExp' }, reward: { stone: 30 } },
  { id: 'a-leisure', age: 1, pic: 'bienetre', kinds: ['baths', 'theater', 'arena'], text: 'Un lieu de détente : thermes, théâtre ou arène', praise: 'Le village a de quoi se détendre.', measure: { t: 'state', f: build(['baths', 'theater', 'arena']) }, reward: { joy: { n: 2, days: 4 } } },
  { id: 'a-lamp', age: 1, kinds: ['lamp'], text: 'Embellir les rues : 6 braseros', praise: 'Les rues sont plus belles.', measure: { t: 'state', f: (c) => [countOf(c, ['lamp']), 6] }, reward: { wood: 30 } },
  { id: 'a-all', age: 1, pic: 'content', text: 'Tous les besoins comblés 2 jours de suite', praise: 'Un village heureux !', measure: { t: 'streak', days: 2, f: allOk }, reward: { wood: 40 } },
  // ---- Médiéval
  { id: 'm-pop45', age: 2, pic: 'logement', kinds: ['house'], text: 'Loger 45 habitants', praise: 'La ville grandit encore.', measure: { t: 'state', f: pop(45) }, reward: { stone: 60 } },
  { id: 'm-mine', age: 2, kinds: ['mine'], text: 'Ouvrir une mine', praise: 'Le minerai sort de la montagne.', measure: { t: 'state', f: build(['mine']) }, reward: { wood: 40 } },
  { id: 'm-tavern', age: 2, kinds: ['tavern'], text: 'Une taverne au village', praise: 'On trinque à la taverne !', measure: { t: 'state', f: build(['tavern']) }, reward: { joy: { n: 2, days: 4 } } },
  { id: 'm-sec', age: 2, pic: 'securite', kinds: ['fire', 'police'], text: 'Protéger la moitié des maisons', praise: 'Les maisons sont mieux gardées.', measure: { t: 'state', f: sec(50) }, reward: { stone: 40 } },
  { id: 'm-harbor', age: 2, kinds: ['harbor'], text: 'Un port sur la côte', praise: 'Les bateaux ont leur port.', measure: { t: 'state', f: build(['harbor']) }, reward: { stone: 40 } },
  { id: 'm-legend', age: 2, pic: 'boussole', exp: true, text: 'Réussir une expédition légendaire', praise: 'Une légende de plus pour le village !', measure: { t: 'event', ev: 'legend' }, reward: { joy: { n: 3, days: 6 } } },
  // ---- Industriel
  { id: 'i-pop80', age: 3, pic: 'logement', kinds: ['house'], text: 'Loger 80 habitants', praise: 'Une vraie ville industrielle.', measure: { t: 'state', f: pop(80) }, reward: { stone: 80 } },
  { id: 'i-station', age: 3, pic: 'train', kinds: ['station'], text: 'Une première gare', praise: 'Le train arrive en gare !', measure: { t: 'state', f: build(['station']) }, reward: { wood: 60 } },
  { id: 'i-brick', age: 3, pic: 'briques', kinds: ['brickworks'], stock: true, text: '20 briques en réserve', praise: 'La briqueterie tourne à plein.', measure: { t: 'state', f: (c) => [Math.floor(c.brick), 20] }, reward: { ore: 5 } },
  { id: 'i-sport', age: 3, pic: 'bienetre', kinds: ['stadium', 'football', 'funfair'], text: 'Un stade d’athlétisme, un terrain de football ou une fête foraine', praise: 'La ville s’amuse !', measure: { t: 'state', f: build(['stadium', 'football', 'funfair']) }, reward: { joy: { n: 2, days: 4 } } },
  { id: 'i-sec', age: 3, pic: 'securite', kinds: ['fire', 'police'], text: 'Protéger 80 % des maisons', praise: 'La ville est bien gardée.', measure: { t: 'state', f: sec(80) }, reward: { stone: 60 } },
  { id: 'i-safe', age: 3, pic: 'boussole', exp: true, text: 'Réussir une expédition sans blessé', praise: 'Tout le monde est rentré sain et sauf.', measure: { t: 'event', ev: 'safeExp' }, reward: { ore: 8 } },
  // ---- Moderne
  { id: 'o-pop130', age: 4, pic: 'logement', kinds: ['house'], text: 'Loger 130 habitants', praise: 'Une grande ville moderne.', measure: { t: 'state', f: pop(130) }, reward: { stone: 100 } },
  { id: 'o-air', age: 4, kinds: ['airport', 'heliport'], text: 'Un aéroport ou un héliport', praise: 'La ville prend son envol.', measure: { t: 'state', f: build(['airport', 'heliport']) }, reward: { wood: 80 } },
  { id: 'o-fun', age: 4, pic: 'bienetre', kinds: ['zoo', 'waterpark'], text: 'Un zoo ou un parc aquatique', praise: 'Une sortie pour toute la famille !', measure: { t: 'state', f: build(['zoo', 'waterpark']) }, reward: { joy: { n: 3, days: 4 } } },
  { id: 'o-sec', age: 4, pic: 'securite', kinds: ['fire', 'police'], text: 'Protéger toutes les maisons', praise: 'Pas une maison sans secours.', measure: { t: 'state', f: sec(100) }, reward: { stone: 80 } },
  { id: 'o-race', age: 4, kinds: ['racetrack'], text: 'Un circuit automobile', praise: 'Les moteurs rugissent, la foule aussi !', measure: { t: 'state', f: build(['racetrack']) }, reward: { joy: { n: 3, days: 4 } } },
  { id: 'o-power', age: 4, kinds: ['powerplant'], text: 'Une centrale électrique', praise: 'La ville ne manquera plus de courant.', measure: { t: 'state', f: build(['powerplant']) }, reward: { stone: 80 } },
  { id: 'o-all', age: 4, pic: 'content', text: 'Tous les besoins comblés 3 jours de suite', praise: 'Une ville où il fait bon vivre.', measure: { t: 'streak', days: 3, f: allOk }, reward: { ore: 10 } },
  // ---- Futuriste
  { id: 'f-pop200', age: 5, pic: 'logement', kinds: ['house'], text: 'Loger 200 habitants', praise: 'Une métropole du futur.', measure: { t: 'state', f: pop(200) }, reward: { stone: 120 } },
  { id: 'f-arco', age: 5, kinds: ['arcology'], text: 'Une arcologie', praise: 'Une ville dans la ville.', measure: { t: 'state', f: build(['arcology']) }, reward: { wood: 100 } },
  { id: 'f-vfarm', age: 5, kinds: ['vfarm'], text: 'Deux fermes verticales', praise: 'Les champs montent vers le ciel.', measure: { t: 'state', f: build(['vfarm'], 2) }, reward: { stone: 80 } },
  { id: 'f-fusion', age: 5, kinds: ['fusion'], text: 'Une centrale à fusion', praise: 'Une énergie sans fin.', measure: { t: 'state', f: build(['fusion']) }, reward: { joy: { n: 3, days: 4 } } },
  { id: 'f-space', age: 5, kinds: ['spaceport'], text: 'Le cosmodrome', praise: 'Les étoiles vous attendent.', measure: { t: 'state', f: build(['spaceport']) }, reward: {} },
];

const BY_ID = new Map(GOALS.map((g) => [g.id, g]));
export const goalById = (id: string) => BY_ID.get(id);
/** Objectifs montrés à la fois */
export const GOALS_SHOWN = 3;

/** L'état sauvegardé avec le monde (`world.goals`) */
export interface GoalState {
  /** objectifs atteints */
  done: string[];
  /** début de la série de jours en cours, par objectif */
  streak: Record<string, number>;
  /** l'hiver a été vu pendant que l'objectif attendait */
  winter: string[];
  /** événements comptés depuis le début (`GoalEvent`) */
  events: Partial<Record<GoalEvent, number>>;
  /** le compte des événements quand l'objectif est apparu : il faut en voir un de plus */
  base: Record<string, number>;
  /** vrai : relu d'une partie d'avant les objectifs ; au premier passage, ce qui est déjà rempli est compté fait, sans récompense */
  quiet?: boolean;
}

export const newGoalState = (): GoalState => ({ done: [], streak: {}, winter: [], events: {}, base: {} });

/** Relit l'état sauvegardé ; absent (ancienne partie) : un état neuf, en mode discret */
export function readGoalState(d: unknown): GoalState {
  if (!d || typeof d !== 'object') return { ...newGoalState(), quiet: true };
  const o = d as Record<string, unknown>, s = newGoalState();
  if (Array.isArray(o.done)) s.done = o.done.filter((x): x is string => typeof x === 'string' && BY_ID.has(x));
  if (Array.isArray(o.winter)) s.winter = o.winter.filter((x): x is string => typeof x === 'string' && BY_ID.has(x));
  const nums = (v: unknown) => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (Number.isFinite(+(n as number))) out[k] = +(n as number);
    return out;
  };
  s.streak = nums(o.streak);
  s.base = nums(o.base);
  s.events = nums(o.events) as GoalState['events'];
  return s;
}

/** Un objectif attend son bâtiment : tous ceux qui le remplissent sont encore fermés par une expédition */
function waiting(g: GoalDef, c: GoalCtx) {
  if (!g.kinds || g.exp) return false;
  return g.kinds.every((k) => KINDS[k].minAge > c.age || (!!KINDS[k].reqMission && !c.missions.includes(KINDS[k].reqMission!)));
}

/** Où en est un objectif : [fait, à faire] */
export function progressOf(g: GoalDef, s: GoalState, c: GoalCtx): [number, number] {
  const m = g.measure;
  if (s.done.includes(g.id)) return [1, 1];
  if (m.t === 'state') return m.f(c);
  if (m.t === 'streak') return [s.streak[g.id] === undefined ? 0 : Math.min(m.days, c.day - s.streak[g.id]), m.days];
  if (m.t === 'winter') return [0, 1];
  return [Math.max(0, (s.events[m.ev] ?? 0) - (s.base[g.id] ?? 0)), 1];
}

/** Les objectifs en cours à cet âge : les premiers de la liste non faits, sans ceux qui attendent leur bâtiment */
export function activeGoals(s: GoalState, c: GoalCtx): GoalDef[] {
  const out: GoalDef[] = [];
  for (const g of GOALS) {
    if (out.length >= GOALS_SHOWN) break;
    if (g.age !== c.age || s.done.includes(g.id) || waiting(g, c) || (g.stock && c.unlimited) || (g.measure.t === 'winter' && c.noWinter)) continue;
    out.push(g);
  }
  return out;
}

/** La récompense en effets (ceux des expéditions) ; le bois et la pierre se donnent à part */
export function rewardEffects(r: GoalReward): Effect[] {
  const out: Effect[] = [];
  if (r.ore) out.push({ t: 'ore', n: r.ore });
  if (r.joy) out.push({ t: 'need', need: 'joy', n: r.joy.n, days: r.joy.days });
  return out;
}

/**
 * Fait avancer les objectifs en cours ; rend ceux qui viennent d'être atteints (le jeu donne la récompense). En mode discret
 * (ancienne partie relue), ce qui est déjà rempli est noté fait sans être rendu, une seule fois
 */
export function stepGoals(s: GoalState, c: GoalCtx): GoalDef[] {
  const quiet = !!s.quiet;
  s.quiet = false;
  const won: GoalDef[] = [];
  // (en mode discret, on repasse jusqu'à ce que la liste ne change plus : un objectif rempli libère la place du suivant)
  for (let pass = 0; pass < (quiet ? GOALS.length : 1); pass++) {
    let changed = false;
    for (const g of activeGoals(s, c)) {
      const m = g.measure;
      if (m.t === 'event' && s.base[g.id] === undefined) s.base[g.id] = s.events[m.ev] ?? 0;
      if (m.t === 'streak') {
        if (!m.f(c)) delete s.streak[g.id];
        else if (s.streak[g.id] === undefined) s.streak[g.id] = c.day;
      }
      let ok = false;
      if (m.t === 'winter') {
        if (c.season === 3) { if (!s.winter.includes(g.id)) s.winter.push(g.id); }
        else ok = s.winter.includes(g.id);
      } else {
        const [have, need] = progressOf(g, s, c);
        ok = have >= need;
      }
      if (!ok || (quiet && m.t !== 'state')) continue;
      s.done.push(g.id);
      delete s.streak[g.id]; delete s.base[g.id];
      s.winter = s.winter.filter((x) => x !== g.id);
      if (!quiet) won.push(g);
      changed = true;
    }
    if (!changed) break;
  }
  return won;
}

/** Un événement : une expédition réussie sans blessé, une légendaire */
export function noteGoalEvent(s: GoalState, ev: GoalEvent) { s.events[ev] = (s.events[ev] ?? 0) + 1; }
