-- Mesure d'audience anonyme (docs/mesure-audience.md). Aucune donnée personnelle : ni nom, ni adresse IP, ni empreinte.
-- Les instants sont en secondes (temps Unix), les jours en AAAA-MM-JJ à l'heure de Paris.

-- Un joueur : un identifiant tiré au hasard par son navigateur
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  -- âge le plus haut atteint hors bac à sable (-1 : bac à sable seulement)
  max_age INTEGER NOT NULL DEFAULT -1,
  lang TEXT NOT NULL,
  version TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0
);

-- Une partie : de son lancement (neuve ou reprise) à la fermeture de l'onglet
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  start_age INTEGER NOT NULL,
  max_age INTEGER NOT NULL,
  mode TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  launch TEXT,
  version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player);

-- Le temps de jeu d'un joueur un jour donné (les joueurs par jour)
CREATE TABLE IF NOT EXISTS days (
  day TEXT NOT NULL,
  player TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, player)
);
