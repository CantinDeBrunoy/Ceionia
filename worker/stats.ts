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
  sessions: number;
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
  /** les 30 derniers jours, du plus ancien à aujourd'hui (les jours sans joueur à zéro) */
  days: DayRow[];
  /** une page de joueurs, de la dernière visite à la plus ancienne */
  list: PlayerRow[];
  page: number;
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
export async function loadReport(db: D1Database, now: number, page = 0): Promise<Report> {
  const today = parisDay(now), midnight = parisMidnight(now);
  // (sept jours de calendrier, aujourd'hui compris ; une heure de jeu en plus ou en moins au changement d'heure : sans effet)
  const week = midnight - 6 * 86400, first = dayBefore(today, 29);
  const [p, s, mp, ms, ages, days, list] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(last_at >= ?1), 0) AS today, COALESCE(SUM(last_at >= ?2), 0) AS week,
      COALESCE(SUM(seconds), 0) AS secs, COALESCE(SUM(seconds = 0), 0) AS idle FROM players`).bind(midnight, week),
    db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(started_at >= ?1), 0) AS today, COALESCE(SUM(seconds), 0) AS secs FROM sessions').bind(midnight),
    db.prepare(medianSql('players')),
    db.prepare(medianSql('sessions')),
    db.prepare('SELECT max_age, COUNT(*) AS n FROM players GROUP BY max_age'),
    db.prepare('SELECT day, COUNT(*) AS players, SUM(seconds) AS seconds FROM days WHERE day >= ?1 GROUP BY day').bind(first),
    db.prepare(`SELECT id, first_at, last_at, seconds, max_age, lang, (SELECT COUNT(*) FROM sessions s WHERE s.player = p.id) AS sessions
      FROM players p ORDER BY last_at DESC LIMIT ?1 OFFSET ?2`).bind(PAGE, page * PAGE),
  ]);
  const one = <T>(r: { results: unknown[] }) => r.results[0] as T;
  const P = one<{ total: number; today: number; week: number; secs: number; idle: number }>(p);
  const S = one<{ total: number; today: number; secs: number }>(s);
  const spread = AGE_NAMES.map((name) => ({ name, players: 0 }));
  let sandboxOnly = 0;
  for (const r of ages.results as { max_age: number; n: number }[]) {
    if (r.max_age < 0) sandboxOnly += r.n;
    else spread[Math.min(r.max_age, spread.length - 1)].players += r.n;
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
    days: last30,
    list: list.results as PlayerRow[],
    page,
  };
}

/** Efface ce qui a plus de `days` jours : parties, jours, et joueurs sans visite depuis (la tâche planifiée du Worker) */
export async function purge(db: D1Database, now: number, days: number) {
  const cut = now - days * 86400;
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE last_at < ?1').bind(cut),
    db.prepare('DELETE FROM days WHERE day < ?1').bind(parisDay(cut)),
    db.prepare('DELETE FROM players WHERE last_at < ?1').bind(cut),
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
