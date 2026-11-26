-- Index du rapport du back-office (worker/stats.ts) et de la purge : comptes du jour et de la semaine, médianes, liste
-- par dernière visite, plafonds de créations par jour, effacement des données de plus de 13 mois
CREATE INDEX IF NOT EXISTS players_last ON players (last_at);
CREATE INDEX IF NOT EXISTS players_first ON players (first_at);
CREATE INDEX IF NOT EXISTS players_seconds ON players (seconds);
CREATE INDEX IF NOT EXISTS sessions_started ON sessions (started_at);
CREATE INDEX IF NOT EXISTS sessions_last ON sessions (last_at);
CREATE INDEX IF NOT EXISTS sessions_seconds ON sessions (seconds);
