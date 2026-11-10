# Remparts

> Fichiers : `src/build/rampart.ts` (tracé, coût, pose, raccords), `src/ui/wallPlan.ts` (`wallLine`, et la pose des murs de la base des Enfers), `src/render/ramparts.ts` (modèles par âge, chemin de ronde), `src/build/tools.ts` (tracé à la souris : `tracingWall`, `wallDown`, `wallLay`, `wallPreview`), `src/build/catalog.ts` (`wall`, `gate`, `isRampart`, `DEFENSES`), `src/world/world.ts` (`canPlace`), `src/sim/sentinels.ts` (sentinelles du chemin de ronde)
> Tests : `tests/remparts.test.ts`, `tests/murs.test.ts` (palissades des Enfers, même tracé), `tests/voletMilitaire.test.ts`
> Voir aussi : [batiments-catalogue.md](batiments-catalogue.md), [placement-construction.md](placement-construction.md), [routes.md](routes.md), [habitants.md](habitants.md), [portail-ile.md](portail-ile.md), [enfers.md](enfers.md), [rendu-modeles.md](rendu-modeles.md)

## En bref
Un rempart est fait de bâtiments de taille 1 : le pan de mur (`wall`) et la porte (`gate`), à côté des tours de garde (`watchtower`). On trace un mur d'un trait, du point A au point B, comme une route libre. Le tracé saute les cases refusées (route, bâtiment, eau, pente) et reprend derrière : un mur s'interrompt de lui-même là où passe une rue. Chaque pan se raccorde à ses voisins à l'affichage (masque de côtés reliés). Les remparts sont du décor : ils ne gênent ni les habitants ni les véhicules, qui ne marchent que sur les routes. Des sentinelles patrouillent sur leur chemin de ronde.

## Règles du jeu
- **Disponibilité** : rayon Militaire, groupe Remparts (`wall`, `gate`) ; `minAge` 1 (Antiquité) ; il faut d'abord une tour de garde au village (`reqKind: 'watchtower'`). La tour elle-même demande l'expédition « Le portail de l'autre rive ». Pas de porte ni de chemin d'accès (`hasDoor` faux).
- **Noms par âge** : pan, Palissade (1), Muraille (2), Enceinte de brique (3), Mur de béton (4), Mur d'énergie (5) ; porte, Porte de palissade, Porte fortifiée, Porte de fer, Portail blindé, Porte à champ de force.
- **Tracer** : outil Bâtir sur `wall` → clic au point A, clic au point B (ou glissé de A à B ; relâcher à plus de 12 px). B devient le point A du mur suivant ; un clic sur A, Échap ou un autre outil arrête. A doit être une case libre posable ou un pan, une porte ou une tour déjà posés, sinon « Un rempart part d'une case libre (ou d'un pan déjà posé) : pas d'une route, d'un bâtiment ni de l'eau. ».
- **Longueur** : `RAMPART_MAX = 60` pans d'un coup (« Trop long : 60 pans au plus d'un coup… »). Les Enfers ont leur propre limite, `WALL_MAX = 40`.
- **Cases** : par case du tracé, le pan se pose si `World.canPlace('wall', x, z)` est nul (donc pas sur une route, un bâtiment, l'eau, devant la porte d'un bâtiment, sur une pente trop forte…). Une case déjà occupée par un rempart compte comme « déjà posée » et ne coûte rien. Les cases refusées sont sautées et comptées.
- **Aperçu** : une tuile par case (`wallCells`, 64 au plus) : verte si un pan s'y posera, rouge si la case est sautée, crème si le pan existe ; le prix du tracé est affiché (« {n} pans : {coût} ») ; un point A pulse.
- **Prix** : facile et sandbox, gratuit (taille 1 → `costOf` rend `null`) ; Normal, un pan vaut `0,34` d'un petit bâtiment : bois `round(0,34 × (5 + 3a))`, pierre `round(0,34 × (3 + 3a))` (3 bois et 2 pierres à l'âge 1, 7 bois et 6 pierres à l'âge 5, `a = max(âge, 1)`). La porte coûte comme un petit bâtiment (taille 1). Prix du tracé : `rampartCost`.
- **Messages** : « Un pan posé » / « {n} pans posés », suivi de « ({n} cases sautées : routes, bâtiments ou eau) » ; « Rien à poser ici : le tracé ne passe que sur des routes, des bâtiments ou de l'eau. » ; si le prix total n'est pas payable, le refus montre « Il faut … (vous avez …) ».
- **Porte** : se pose comme un bâtiment ordinaire (clic) sur une case libre ou **sur une route** (`canPlace` lui permet la route, elle l'enjambe, battants ouverts). Sur une route, il faut une rue droite : deux voisines face à face, ni virage ni carrefour (« La porte se pose sur une rue droite : pas dans un virage ni à un carrefour »). La rue passe droit sous l'arche. Elle se tourne seule dans l'axe du mur voisin, ou dans l'axe de la rue si elle n'a pas de voisin.
- **Démolir** : comme tout bâtiment (taille 1 : le pinceau large les efface aussi). Annuler (Ctrl+Z) défait le tracé en un coup.
- **Tour de garde** : le mur se soude à sa face ; la case devant la porte d'une tour reste posable pour un rempart (exception de `canPlace`) ; on monte à la tour par le chemin de ronde.
- **Sentinelles** (`sim/sentinels.ts`) : sur chaque chaîne de remparts reliés par un côté (pans, portes, tours) d'au moins `CHAIN_MIN = 3` cases, un soldat fait les cent pas sur le chemin de ronde ; deux dès `CHAIN_LONG = 8` ; une sentinelle veille sur la plate-forme de chaque tour ; `SENTINEL_MAX = 12`.

## Fonctionnement dans le code
- **Tracé** : `traceRampart(w, a, b)` → `{ cells, ok[], had[], why }`. `wallLine(a, b)` (`wallPlan.ts`, partagé avec les Enfers) donne la ligne de centres de cases raccordées par un côté (une diagonale devient un escalier : rien ne passe en biais) ; `ok[i]` = déjà posé ou `canPlace` nul.
- **Pose** : `layRampart(w, trace, age)` boucle sur les cases : saute `had`, compte `skipped` pour `!ok` (et re-contrôle `canPlace`), s'arrête net (`short`) au premier manque de moyens, sinon `pay` puis `World.place('wall', x, z, 0, false, max(âge, 1), animate)` (seul le premier pan s'anime).
- **Outil** (`tools.ts`) : `wallDown` choisit A puis appelle `wallLay` ; `wallLay` : `traceRampart`, refus si `why` ou si le prix total n'est pas payable, `beginStroke` + `mark()` (annulable d'un coup), `layRampart`, message, `freeFrom = B`. L'aperçu est recalculé quand A, B ou `w.version` changent (`wallKey`). `freeStage` (0, 1, 2) pilote la bulle « Cliquez le point A / B » de l'interface.
- **Raccords** : `rampartMask(w, b)` renvoie le masque des côtés reliés (`WALL_N/E/S/W` = 1, 2, 4, 8, définis dans `render/hellBase.ts`) ; un voisin relie s'il est un pan, une porte ou une tour de garde (`joins`) ; les bits `<< TOWER_SHIFT` (4) disent qu'une tour est le voisin de ce côté (le bras dépasse le bord de la case jusqu'à la face de la tour). Une porte sans voisin regarde la rue qu'elle enjambe.
- **Modèle** (`render/ramparts.ts`) : `rampartWall(p, age, mask, kit)` et `rampartGate(…)`, un modèle par âge (`rampartAge = clamp(âge, 1, 5)` ; les âges 0 et 1 partagent la palissade) : bras (`armPalisade`, `armStone`, `armBrick`, `armConcrete`, `armEnergy`) vers chaque côté relié, orientés par `orient`, et un nœud (`nodeKind(mask)` : bout, ligne droite, angle, carrefour : pilier ou tourelle). Le chemin de ronde reste du même côté le long d'un mur droit (bras en miroir à l'ouest et au sud, pas tournés d'un demi-tour). Clé du cache de modèles : `kind|âge|v|taille|m{masque}` (`getModel`).
- **Rafraîchissement des voisins** : `BuildingView.opts` calcule `mask` ; `onAdd`/`onRemove` appellent `refreshNear`, qui rafraîchit tous les bâtiments dans le carré de 1 case autour de l'emprise (diagonales comprises) : poser ou démolir un pan met à jour ses voisins.
- **Chemin de ronde** : `WALK[âge]` (`y`, `z`, `gate`, `frame`, `tower`) donne la hauteur du sommet, l'écart à l'axe, la hauteur du linteau de porte et la place de la sentinelle sur une tour ; `TOWER_R[âge]` le rayon de la tour où le mur se soude. `Sentinels.spot(case)` place le soldat avec ces valeurs.
- **Garnison** : la tour (`GARRISONS`) envoie des patrouilles dans les rues voisines ([habitants.md](habitants.md)) ; le mur n'en envoie pas.

## Liens avec les autres systèmes
- Placement : [placement-construction.md](placement-construction.md) (`canPlace`, verrou, annuler).
- Routes : le mur saute les routes, la porte les enjambe ; la rue sous une porte est dessinée droite (`RoadView.gated`), [routes.md](routes.md).
- Île du portail : tour, caserne, mur et porte sont des `DEFENSES` ; elles se posent aussi sur l'île, [portail-ile.md](portail-ile.md).
- Enfers : la base avancée a ses palissades et sa porte (`BaseKind` `palisade`, `gate` dans `sim/hellBase.ts`) ; `wallLine` est commun, le reste est distinct, [enfers.md](enfers.md).
- Sécurité : la tour de garde compte comme un poste de police ; les remparts n'apportent aucun besoin (ni logement, ni travail).
- Modèles : [rendu-modeles.md](rendu-modeles.md) (les défenses futuristes sont dessinées aussi dans `futureModel`).

## Pièges et invariants
- Le prix du tracé est vérifié en entier avant la pose (`wallLay`), alors que `layRampart` sait s'arrêter au milieu (`short`) : par l'interface, on ne pose donc jamais un tracé à moitié payé. Le test « sans bois, le tracé s'arrête net » vise `layRampart` seul.
- `ok` est calculé à l'aperçu avec l'état du monde de ce moment ; `layRampart` re-contrôle chaque case. Un tracé n'est jamais posé tel qu'affiché si le monde a changé entre-temps.
- `canPlace` autorise la porte sur une route mais pas le pan ; ne pas l'inverser (le test « refusés dans l'eau, sur un bâtiment, sur une route (sauf la porte) » de `tests/remparts.test.ts` le garde).
- Le masque change quand un voisin apparaît ou disparaît : toute opération qui ajoute ou retire un bâtiment par `World.place`/`removeBuilding` déclenche `refreshNear` ; un chargement de sauvegarde (`restore`, `onReset`) doit refaire tous les modèles.
- La porte est le seul bâtiment qu'on pose sur une route : `World.place` ne retire pas la route (la case reste route : les chemins la traversent, la sentinelle ne s'y tient pas, voir `Sentinels.plan`, qui écarte les cases à `road === 1`). À vérifier à l'écran si les sentinelles passent bien sur le linteau des portes.
- Un pan est un bâtiment comme un autre dans `World.buildings` : compté dans `Sim.counts`, sauvé dans la sauvegarde, effacé par le pinceau de démolition ; il occupe `occ`, donc bloque les routes libres et automatiques. Les routes libres le contournent ; les automatiques ne passent pas non plus.
- Le tracé ne fait pas de pont : sur l'eau, les cases sont sautées et le mur reprend de l'autre côté (un pan isolé peut donc se retrouver sur l'autre rive).
- Mur et tour : la case devant la porte d'une tour est libre pour un rempart, mais pas pour un autre bâtiment.
- Limite de tracé : `RAMPART_MAX = 60` mais `wallCells` ne compte que 64 instances : ne pas relever la première sans la seconde.

## Pour modifier
- **Nouveau modèle d'âge** : ajouter le bras, le nœud et la porte dans les tableaux `ARMS`, `NODES`, `GATES` (indexés par âge) et une ligne dans `WALK` / `TOWER_R` (`ramparts.ts`) ; vérifier `tests/remparts.test.ts` (un modèle distinct par âge, bras jusqu'au bord, porte qui laisse le passage).
- **Changer le prix** : la ligne `kind === 'wall' ? 0.34` de `costOf` (`economy.ts`).
- **Allonger ou raccourcir un tracé** : `RAMPART_MAX` (`rampart.ts`) et les 64 instances de `wallCells` (`tools.ts`).
- **Nouveau voisin qui se raccorde** : `joins` (`rampart.ts`) et `rampartMask`, puis un cas dans les bras (`towerJoin`, `gateJoin`).
- **Sentinelles** : `CHAIN_MIN`, `CHAIN_LONG`, `SENTINEL_MAX` (`sentinels.ts`).
