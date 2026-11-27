-- Le temps de jeu de chaque joueur dans chaque âge (hors bac à sable), pour la répartition par âge du back-office : un joueur
-- qui passe 10 min dans un âge, 20 dans un autre puis 5 dans un troisième compte dans les trois (demande de l'auteur,
-- 27 nov. 2026). Rempli par chaque signal (worker/index.ts, recordPing)
CREATE TABLE IF NOT EXISTS player_ages (
  player TEXT NOT NULL,
  age INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, age)
);

-- Reprise des parties déjà enregistrées, au mieux : le temps d'une partie partagé à parts égales entre les âges qu'elle a
-- traversés (de son âge de départ au plus haut). Approché, mais il place chacun dans les bons âges
INSERT OR IGNORE INTO player_ages (player, age, seconds)
WITH RECURSIVE part(player, age, last, secs) AS (
  SELECT player, start_age, max_age, seconds * 1.0 / (max_age - start_age + 1) FROM sessions
    WHERE mode != 'sandbox' AND difficulty != 'sandbox' AND start_age >= 0 AND max_age >= start_age
  UNION ALL
  SELECT player, age + 1, last, secs FROM part WHERE age < last
)
SELECT player, age, CAST(ROUND(SUM(secs)) AS INTEGER) FROM part GROUP BY player, age;
