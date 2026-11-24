import type { KindId } from '../build/catalog';

/**
 * Les Jeux des îles (chantier D du nouveau monde ; l'auteur les a préférés à l'Exposition, réponses du 24 nov. 2026) : le
 * grand moment de la voie de la paix, au Moderne. Dans l'ordre :
 * 1. **la candidature** : un pourparler à trois peuples (l'expédition `gamesBid`, deux lieux), qui peut échouer et se retente ;
 * 2. **la préparation** : bâtir le site des Jeux (`gamesSite`) dans la concession, puis le chantier en `DELIVERIES` livraisons
 *    (briques, minerai, or), une jauge sur la feuille de route ;
 * 3. **l'accueil** : `HOST_DAYS` jours de jeu, une jauge « Accueil » qui lit les besoins du village (logement, nourriture,
 *    bien-être, transports), et une ou deux surprises en cartes à choix ;
 * 4. **les épreuves** : trois cartes à choix (la régate dans le bras de mer, la course, le tournoi), chacune gagnée ou non
 *    selon le choix et ce que le village a ;
 * 5. **la cérémonie** (environ 30 s : le défilé des navires des trois peuples, les feux d'artifice, les trois drapeaux), puis
 *    **la dernière carte** : le traité des îles ou l'union des îles. Le conflit passe à `peace`.
 * Règles pures, état sauvegardé dans `diplo.games`. Voir `docs/diplomatie.md`, « Les Jeux des îles ».
 */

export type GamesStage = 'bid' | 'build' | 'host' | 'trials' | 'ceremony' | 'done';
export type GamesEnd = 'treaty' | 'union';
export type TrialId = 'regatta' | 'race' | 'tourney';
export const TRIALS: TrialId[] = ['regatta', 'race', 'tourney'];
/** Les deux façons de mener une épreuve : `bold` (on vise la victoire, plus risqué), `fair` (le jeu d'équipe, plus sûr) */
export type TrialPick = 'bold' | 'fair' | 'guest';
export type SurpriseId = 'storm' | 'late' | 'guest';
export const SURPRISES: SurpriseId[] = ['storm', 'late', 'guest'];

export interface GamesState {
  /** la candidature est acceptée (l'expédition `gamesBid` réussie) */
  bid: boolean;
  /** livraisons faites au chantier des Jeux */
  delivered: number;
  /** l'accueil : son début (`exp.clock` ; -1 : pas commencé), la jauge cumulée (points) et le nombre de mesures */
  hostAt: number;
  /** l'accueil est fini (son temps écoulé) */
  hosted: boolean;
  welcome: number;
  samples: number;
  /** les surprises venues (et réglées), celle qui attend son choix */
  surprises: SurpriseId[];
  pending: SurpriseId | null;
  /** points gagnés aux surprises (bien ou mal réglées) */
  bonus: number;
  /** les épreuves jouées : gagnées ou non */
  trials: { id: TrialId; won: boolean }[];
  /** la cérémonie a été vue ; la fin choisie */
  ceremony: boolean;
  end: GamesEnd | null;
}

export const newGames = (): GamesState => ({ bid: false, delivered: 0, hostAt: -1, hosted: false, welcome: 0, samples: 0, surprises: [], pending: null, bonus: 0, trials: [], ceremony: false, end: null });

/** Relit l'état sauvegardé (absent : rien de fait) */
export function readGames(g: any): GamesState {
  const s = newGames();
  if (!g || typeof g !== 'object') return s;
  const n = (v: unknown, lo: number, hi: number, d = 0) => (Number.isFinite(+(v as number)) && v !== null ? Math.max(lo, Math.min(hi, +(v as number))) : d);
  s.bid = g.bid === true;
  s.delivered = Math.round(n(g.delivered, 0, DELIVERIES));
  s.hostAt = n(g.hostAt, -1, Infinity, -1);
  s.hosted = g.hosted === true;
  s.welcome = n(g.welcome, 0, Infinity);
  s.samples = Math.round(n(g.samples, 0, Infinity));
  s.surprises = Array.isArray(g.surprises) ? SURPRISES.filter((x) => g.surprises.includes(x)) : [];
  s.pending = SURPRISES.includes(g.pending) ? g.pending : null;
  s.bonus = n(g.bonus, -50, 50);
  s.trials = Array.isArray(g.trials) ? g.trials.filter((t: any) => TRIALS.includes(t?.id)).map((t: any) => ({ id: t.id as TrialId, won: t.won === true })).slice(0, TRIALS.length) : [];
  s.ceremony = g.ceremony === true;
  s.end = g.end === 'treaty' || g.end === 'union' ? g.end : null;
  return s;
}

/** L'expédition de la candidature (un pourparler à trois) et le site des Jeux (bâti dans la concession) */
export const BID_MISSION = 'gamesBid';
export const GAMES_SITE: KindId = 'gamesSite';
/** Le chantier des Jeux : livraisons, et ce que coûte chacune */
export const DELIVERIES = 3;
export const DELIVERY_COST = { bricks: 40, ore: 30, gold: 25 } as const;
/** L'accueil : sa durée (jours de jeu), les moments des surprises (part de l'accueil) */
export const HOST_DAYS = 1.5;
export const SURPRISE_AT = [0.3, 0.7];
/** Une épreuve gagnée vaut tant de points pour la jauge finale ; l'accueil réussi au-dessus de ce seuil (sur 100) */
export const TRIAL_PTS = 10, WELCOME_GOOD = 60;
/** Le traité : de l'or chaque jour ; l'union : les visites des îles toujours sûres, le centre de recherche commun double */
export const TREATY_GOLD = 4, UNION_GOLD = 2;

/** L'étape du moment des Jeux */
export function gamesStage(g: GamesState, built: boolean): GamesStage {
  if (!g.bid) return 'bid';
  if (!built || g.delivered < DELIVERIES) return 'build';
  if (!hostDone(g)) return 'host';
  if (g.trials.length < TRIALS.length) return 'trials';
  if (!g.end) return 'ceremony';
  return 'done';
}

/** Ce que lit l'accueil dans le village (chaque part de 0 à 1) */
export interface HostNeeds { housing: number; food: number; joy: number; transport: number }
/** La jauge « Accueil » à cet instant (0 … 100) : la moyenne des besoins, pondérée (le logement et la nourriture d'abord) */
export function welcomeNow(n: HostNeeds) {
  const c = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return Math.round((c(n.housing) * 0.3 + c(n.food) * 0.3 + c(n.joy) * 0.2 + c(n.transport) * 0.2) * 100);
}
/** La jauge de l'accueil, sur ce qu'on a mesuré (et les surprises) ; 50 avant toute mesure */
export function welcomeScore(g: GamesState) {
  const base = g.samples ? g.welcome / g.samples : 50;
  return Math.max(0, Math.min(100, Math.round(base + g.bonus)));
}

/** Une livraison au chantier : possible ? (null : oui) */
export function deliverWhy(g: GamesState, built: boolean, stock: { bricks: number; ore: number; gold: number }): 'bid' | 'site' | 'done' | 'res' | null {
  if (!g.bid) return 'bid';
  if (!built) return 'site';
  if (g.delivered >= DELIVERIES) return 'done';
  if (stock.bricks < DELIVERY_COST.bricks || stock.ore < DELIVERY_COST.ore || stock.gold < DELIVERY_COST.gold) return 'res';
  return null;
}
/** Livrer (les stocks payent ; renvoie faux si ce n'est pas possible) */
export function deliver(g: GamesState, built: boolean, stock: { bricks: number; ore: number; gold: number }) {
  if (deliverWhy(g, built, stock)) return false;
  stock.bricks -= DELIVERY_COST.bricks; stock.ore -= DELIVERY_COST.ore; stock.gold -= DELIVERY_COST.gold;
  g.delivered++;
  return true;
}

/** L'accueil commence (le chantier livré) */
export function startHost(g: GamesState, clock: number) {
  if (g.hostAt >= 0 || g.delivered < DELIVERIES || !g.bid) return false;
  g.hostAt = clock;
  return true;
}
/** La part de l'accueil écoulée (0 … 1) */
export const hostShare = (g: GamesState, clock: number, dayLen: number) => (g.hostAt < 0 ? 0 : Math.max(0, Math.min(1, (clock - g.hostAt) / (HOST_DAYS * dayLen))));
/** L'accueil est fini : son temps écoulé (noté par `stepHost`), toutes ses surprises réglées */
export const hostDone = (g: GamesState) => g.hostAt >= 0 && g.hosted && !g.pending;

/**
 * Le pas de l'accueil, au fil du temps : la jauge mesure les besoins du village ; une surprise arrive à ses moments (renvoie
 * son id, une fois). `pick` choisit la surprise (les tests : la première pas encore venue)
 */
export function stepHost(g: GamesState, clock: number, dayLen: number, needs: HostNeeds, dt: number, pick: () => number = Math.random): SurpriseId | null {
  if (g.hostAt < 0 || g.pending || g.hosted) return null;
  // (une mesure par seconde de jeu, environ)
  g.welcome += welcomeNow(needs) * Math.max(0, dt);
  g.samples += Math.max(0, dt);
  const share = hostShare(g, clock, dayLen), due = SURPRISE_AT.filter((t) => share >= t).length;
  if (g.surprises.length < due) {
    const left = SURPRISES.filter((s) => !g.surprises.includes(s));
    const s = left[Math.floor(pick() * left.length) % left.length] ?? SURPRISES[0];
    g.surprises.push(s);
    g.pending = s;
    return s;
  }
  if (share >= 1) g.hosted = true;
  return null;
}

/** Les choix d'une surprise : ce qu'ils donnent à la jauge, et ce qu'ils coûtent */
export interface SurpriseChoice { id: string; pts: number; gold?: number; joy?: number }
export const SURPRISE_CHOICES: Record<SurpriseId, SurpriseChoice[]> = {
  // un orage sur le stade : abriter la foule (de l'or pour les toiles), ou attendre qu'il passe
  storm: [{ id: 'shelter', pts: 8, gold: 15 }, { id: 'wait', pts: -6 }],
  // le pavillon du rival est en retard : nos ouvriers l'aident, ou on ouvre sans lui
  late: [{ id: 'help', pts: 10, gold: 20 }, { id: 'open', pts: -4 }],
  // un visiteur de marque débarque : le recevoir au palais (une fête), ou le laisser dans la foule
  guest: [{ id: 'receive', pts: 12, gold: 10, joy: 2 }, { id: 'crowd', pts: 2 }],
};
/** Régler la surprise en attente (renvoie le choix, ou null) */
export function settleSurprise(g: GamesState, choice: string, gold = Infinity): SurpriseChoice | null {
  if (!g.pending) return null;
  const c = SURPRISE_CHOICES[g.pending].find((x) => x.id === choice);
  if (!c || (c.gold ?? 0) > gold) return null;
  g.bonus += c.pts;
  g.pending = null;
  return c;
}

/**
 * Une épreuve : ce que le village apporte (la flotte pour la régate, les routes et le chemin de fer pour la course, les troupes
 * pour le tournoi), une chance de victoire selon le choix. `roll` : le hasard (les tests le fixent)
 */
export interface TrialCtx { ships: number; transport: number; troops: number }
export function trialChance(id: TrialId, pick: TrialPick, c: TrialCtx) {
  const base = id === 'regatta' ? 0.35 + Math.min(0.3, c.ships * 0.06) : id === 'race' ? 0.35 + Math.min(0.3, c.transport * 0.3) : 0.35 + Math.min(0.3, c.troops * 0.02);
  return Math.max(0.05, Math.min(0.95, pick === 'bold' ? base + 0.1 : pick === 'fair' ? base + 0.2 : base));
}
/** Les choix d'une épreuve (le troisième : laisser la victoire à un invité, la bonne volonté avant la médaille) */
export const TRIAL_PICKS: TrialPick[] = ['fair', 'bold', 'guest'];
/** Jouer l'épreuve suivante ; renvoie l'épreuve et son issue */
export function playTrial(g: GamesState, pick: TrialPick, c: TrialCtx, roll: number): { id: TrialId; won: boolean } | null {
  const id = TRIALS[g.trials.length];
  if (!id) return null;
  // (« laisser l'invité gagner » : pas de médaille, mais l'accueil y gagne)
  const won = pick !== 'guest' && roll < trialChance(id, pick, c);
  if (pick === 'guest') g.bonus += 6;
  const t = { id, won };
  g.trials.push(t);
  return t;
}
/** Les médailles gagnées */
export const medals = (g: GamesState) => g.trials.filter((t) => t.won).length;

/** La cérémonie vue : la dernière carte attend */
export function ceremonyDone(g: GamesState) { if (g.trials.length < TRIALS.length) return false; g.ceremony = true; return true; }
/** La dernière carte : le traité ou l'union (le conflit passe alors à `peace`, voir `Game.endGames`) */
export function chooseEnd(g: GamesState, e: GamesEnd) {
  if (!g.ceremony || g.end) return false;
  g.end = e;
  return true;
}
/** L'or que rapporte la fin choisie, chaque jour de jeu */
export const gamesGold = (g: Pick<GamesState, 'end'>) => (g.end === 'treaty' ? TREATY_GOLD : g.end === 'union' ? UNION_GOLD : 0);
