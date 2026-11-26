/**
 * Mesure d'audience : les chiffres du back-office, calculés à partir des lignes de D1 (voir docs/mesure-audience.md).
 * Pur : testé dans tests/mesureAudience.test.ts
 */
import { AGE_NAMES, parisDay } from './ping';

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
export interface SessionRow { started_at: number; seconds: number }
export interface DayRow { day: string; players: number; seconds: number }

export interface Report {
  today: string;
  players: { today: number; week: number; total: number };
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
  /** joueurs, de la dernière visite à la plus ancienne */
  list: PlayerRow[];
}

/** La médiane (moyenne des deux du milieu pour un nombre pair) ; 0 sans valeur */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Les joueurs par âge le plus haut atteint (tous les âges, même vides), et ceux du bac à sable seul */
export function ageSpread(players: Pick<PlayerRow, 'max_age'>[]) {
  const ages = AGE_NAMES.map((name) => ({ name, players: 0 }));
  let sandboxOnly = 0;
  for (const p of players) {
    if (p.max_age < 0) sandboxOnly++;
    else ages[Math.min(p.max_age, ages.length - 1)].players++;
  }
  return { ages, sandboxOnly };
}

/** Le jour `n` jours avant `day` (AAAA-MM-JJ) */
export function dayBefore(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Le rapport du back-office ; `now` en secondes */
export function buildReport(players: PlayerRow[], sessions: SessionRow[], days: DayRow[], now: number): Report {
  const today = parisDay(now), week = dayBefore(today, 6);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const last30: DayRow[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = dayBefore(today, i);
    last30.push(byDay.get(day) ?? { day, players: 0, seconds: 0 });
  }
  const pSec = players.map((p) => p.seconds), sSec = sessions.map((s) => s.seconds);
  return {
    today,
    players: {
      today: players.filter((p) => parisDay(p.last_at) === today).length,
      week: players.filter((p) => parisDay(p.last_at) >= week).length,
      total: players.length,
    },
    sessions: { today: sessions.filter((s) => parisDay(s.started_at) === today).length, total: sessions.length },
    time: {
      total: pSec.reduce((a, b) => a + b, 0),
      perPlayer: { mean: mean(pSec), median: median(pSec) },
      perSession: { mean: mean(sSec), median: median(sSec) },
    },
    ...ageSpread(players),
    days: last30,
    list: [...players].sort((a, b) => b.last_at - a.last_at),
  };
}

/** Une durée lisible : « 45 s », « 12 min », « 3 h 05 » */
export function duration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m === 60 ? `${h + 1} h 00` : `${h} h ${String(m).padStart(2, '0')}`;
}
