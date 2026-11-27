/**
 * Mesure d'audience : les chiffres du back-office, calculés par D1 (sommes, comptes, médianes, répartition), en un seul
 * aller-retour. Le Worker ne reçoit que des totaux et une page de la liste : son temps de calcul ne grandit pas avec la base
 * (10 ms par requête dans l'offre gratuite). Testé dans tests/mesureAudience.test.ts (sur SQLite en mémoire)
 */
import type { D1Database } from './d1';
import { AGE_NAMES, parisDay, parisMidnight } from './ping';

export interface PlayerRow {
  id: string;
  first_at: number;
  last_at: number;
  seconds: number;
  /** âge le plus haut atteint hors bac à sable ; -1 : n'a joué qu'au bac à sable */
  max_age: number;
  lang: string;
  /** la version du jeu au dernier signal */
  version: string;
  sessions: number;
}
export interface SessionRow {
  started_at: number;
  last_at: number;
  seconds: number;
  start_age: number;
  max_age: number;
  mode: string;
  difficulty: string;
  launch: string | null;
  version: string;
}
export interface DayRow { day: string; players: number; seconds: number }

/** joueurs listés par page */
export const PAGE = 100;

export interface Report {
  today: string;
  players: { today: number; week: number; total: number; idle: number };
  sessions: { today: number; total: number };
  time: {
    total: number;
    perPlayer: { mean: number; median: number };
    perSession: { mean: number; median: number };
  };
  /** joueurs par âge le plus haut atteint (indice de `AGE_NAMES`), et ceux qui n'ont joué qu'au bac à sable */
  ages: { name: string; players: number }[];
  sandboxOnly: number;
  /** l'âge le plus haut atteint, joueur par joueur (-1 : bac à sable seul), du premier venu au dernier : son rang donne sa couleur */
  reached: { player: string; age: number }[];
  /** le temps passé dans chaque âge (indice de `AGE_NAMES`), joueur par joueur : un joueur compte dans chaque âge joué */
  ageTime: { player: string; age: number; seconds: number }[];
  /** les 30 derniers jours, du plus ancien à aujourd'hui (les jours sans joueur à zéro) */
  days: DayRow[];
  /** une page de joueurs, de la dernière visite à la plus ancienne */
  list: PlayerRow[];
  page: number;
  /** le joueur choisi d'un clic (`/bo?joueur=…`) : sa fiche et ses parties, de la plus récente à la plus ancienne ; null sinon */
  focus: { player: PlayerRow; sessions: SessionRow[] } | null;
  /** le jour choisi d'un clic (`/bo?jour=AAAA-MM-JJ`) : ses joueurs et leur temps ce jour-là, du plus long au plus court ; null sinon */
  day: { day: string; players: { player: string; seconds: number }[] } | null;
}

/** Le jour `n` jours avant `day` (AAAA-MM-JJ) */
export function dayBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// la médiane de `seconds` d'une table : la valeur du milieu, ou la moyenne des deux du milieu
const medianSql = (t: string) => `SELECT COALESCE(AVG(seconds), 0) AS m FROM (SELECT seconds FROM ${t} ORDER BY seconds
  LIMIT 2 - (SELECT COUNT(*) FROM ${t}) % 2 OFFSET ((SELECT COUNT(*) FROM ${t}) - 1) / 2)`;

/** Le rapport du back-office ; `now` en secondes, `page` à partir de 0 */
/**
 * L'âge le plus haut atteint EN JOUANT par un joueur : celui des parties neuves, ou des parties où l'âge a monté. Rouvrir une
 * vieille sauvegarde ne compte pas : un joueur qui ouvre 20 s une partie au Moderne puis mène une partie neuve de la
 * Préhistoire au Médiéval s'arrête au Médiéval (cas réel, 27 nov. 2026). Sans partie de ce genre, l'âge le plus haut vu hors
 * bac à sable ; sans partie du tout (purgées), celui gardé sur le joueur (-1 : bac à sable seul)
 */
export const REACHED_SQL = `COALESCE(
  (SELECT MAX(s.max_age) FROM sessions s WHERE s.player = p.id AND s.mode != 'sandbox' AND s.difficulty != 'sandbox'
    AND (s.launch = 'new' OR s.max_age > s.start_age)),
  (SELECT MAX(s.max_age) FROM sessions s WHERE s.player = p.id AND s.mode != 'sandbox' AND s.difficulty != 'sandbox'),
  p.max_age)`;

export async function loadReport(db: D1Database, now: number, page = 0, focus = '', day = ''): Promise<Report> {
  const today = parisDay(now), midnight = parisMidnight(now);
  // (sept jours de calendrier, aujourd'hui compris ; une heure de jeu en plus ou en moins au changement d'heure : sans effet)
  const week = midnight - 6 * 86400, first = dayBefore(today, 29);
  const [p, s, mp, ms, ages, days, list, ageTime, fp, fs, fd] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(last_at >= ?1), 0) AS today, COALESCE(SUM(last_at >= ?2), 0) AS week,
      COALESCE(SUM(seconds), 0) AS secs, COALESCE(SUM(seconds = 0), 0) AS idle FROM players`).bind(midnight, week),
    db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(started_at >= ?1), 0) AS today, COALESCE(SUM(seconds), 0) AS secs FROM sessions').bind(midnight),
    db.prepare(medianSql('players')),
    db.prepare(medianSql('sessions')),
    db.prepare(`SELECT id AS player, ${REACHED_SQL} AS age FROM players p ORDER BY first_at, id`),
    db.prepare('SELECT day, COUNT(*) AS players, SUM(seconds) AS seconds FROM days WHERE day >= ?1 GROUP BY day').bind(first),
    db.prepare(`SELECT id, first_at, last_at, seconds, ${REACHED_SQL} AS max_age, lang, version, (SELECT COUNT(*) FROM sessions s WHERE s.player = p.id) AS sessions
      FROM players p ORDER BY last_at DESC LIMIT ?1 OFFSET ?2`).bind(PAGE, page * PAGE),
    db.prepare('SELECT player, age, seconds FROM player_ages WHERE seconds > 0 ORDER BY age, seconds DESC'),
    // (le joueur choisi : rien sans choix, la liste du batch reste la même)
    db.prepare(`SELECT id, first_at, last_at, seconds, ${REACHED_SQL} AS max_age, lang, version, (SELECT COUNT(*) FROM sessions s WHERE s.player = p.id) AS sessions
      FROM players p WHERE id = ?1`).bind(focus),
    db.prepare(`SELECT started_at, last_at, seconds, start_age, max_age, mode, difficulty, launch, version FROM sessions WHERE player = ?1
      ORDER BY started_at DESC LIMIT ?2`).bind(focus, PAGE),
    db.prepare('SELECT player, seconds FROM days WHERE day = ?1 ORDER BY seconds DESC, player').bind(day),
  ]);
  const one = <T>(r: { results: unknown[] }) => r.results[0] as T;
  const P = one<{ total: number; today: number; week: number; secs: number; idle: number }>(p);
  const S = one<{ total: number; today: number; secs: number }>(s);
  const spread = AGE_NAMES.map((name) => ({ name, players: 0 }));
  let sandboxOnly = 0;
  const reached = ages.results as { player: string; age: number }[];
  for (const r of reached) {
    if (r.age < 0) sandboxOnly++;
    else spread[Math.min(r.age, spread.length - 1)].players++;
  }
  const byDay = new Map((days.results as DayRow[]).map((d) => [d.day, d]));
  const last30: DayRow[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = dayBefore(today, i);
    last30.push(byDay.get(day) ?? { day, players: 0, seconds: 0 });
  }
  return {
    today,
    players: { today: P.today, week: P.week, total: P.total, idle: P.idle },
    sessions: { today: S.today, total: S.total },
    time: {
      total: P.secs,
      perPlayer: { mean: P.total ? P.secs / P.total : 0, median: one<{ m: number }>(mp).m },
      perSession: { mean: S.total ? S.secs / S.total : 0, median: one<{ m: number }>(ms).m },
    },
    ages: spread,
    sandboxOnly,
    reached,
    ageTime: ageTime.results as { player: string; age: number; seconds: number }[],
    days: last30,
    list: list.results as PlayerRow[],
    page,
    day: day ? { day, players: fd.results as { player: string; seconds: number }[] } : null,
    focus: fp.results.length ? { player: fp.results[0] as PlayerRow, sessions: fs.results as SessionRow[] } : null,
  };
}

/** Efface ce qui a plus de `days` jours : parties, jours, et joueurs sans visite depuis (la tâche planifiée du Worker) */
export async function purge(db: D1Database, now: number, days: number) {
  const cut = now - days * 86400;
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE last_at < ?1').bind(cut),
    db.prepare('DELETE FROM days WHERE day < ?1').bind(parisDay(cut)),
    db.prepare('DELETE FROM players WHERE last_at < ?1').bind(cut),
    db.prepare('DELETE FROM player_ages WHERE player NOT IN (SELECT id FROM players)'),
  ]);
}

/** Une durée lisible : « 45 s », « 12 min », « 3 h 05 », « 27 664 h 28 » */
export function duration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  // (les milliers d'heures séparés par une espace fine insécable : « 27 664 h 28 »)
  const hh = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return m === 60 ? `${hh(h + 1)} h 00` : `${hh(h)} h ${String(m).padStart(2, '0')}`;
}
