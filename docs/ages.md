# Les âges

> Fichiers : `src/build/catalog.ts` (`AGES`, `AgeDef`, `minAge` / `maxAge`), `src/sim/sim.ts` (`ageProgress`, `reqKindsOf`, `usedBefore`, `advance`, `ready`), `src/sim/missions.ts` (`mandatoriesFor`), `src/main.ts` (`sim.onAgeUp`), `src/render/buildings.ts` (évolution des modèles), `src/ui/ui.ts` (`#agePanel`, `showNewAge`, `lockOf`), `src/sim/difficulty.ts` (`newOnly`).
> Tests : `tests/difficulty.test.ts` (passage d'âge en Normal), `tests/conditionsAge.test.ts` (le geste de chaque condition), `tests/baseAges.test.ts`, `tests/rail.test.ts`, `tests/briques.test.ts`, `tests/or.test.ts`.
> Voir aussi : [besoins-population.md](besoins-population.md), [economie-ressources.md](economie-ressources.md), [difficulte.md](difficulte.md), [batiments-catalogue.md](batiments-catalogue.md), [rendu-modeles.md](rendu-modeles.md), [portail-ile.md](portail-ile.md), [chemin-de-fer.md](chemin-de-fer.md).

## En bref
Six âges, de 0 à 5. Le village est à un âge (`Sim.age`) ; il passe au suivant **quand le joueur clique** sur « Passer à : … », une fois toutes les conditions réunies (ce n'est plus automatique). L'âge règle quels bâtiments sont disponibles, l'aspect de tout le village (modèles, jardins, véhicules), les apports des bâtiments et leurs prix.

## Règles du jeu

### Les âges (`AGES`, `catalog.ts`)
| N° | Nom | Devise | Habitants requis pour l'atteindre |
|---|---|---|---|
| 0 | Préhistoire | Feux de camp et huttes | 0 |
| 1 | Antiquité | Maisons de tuiles, temples et agoras | 12 |
| 2 | Médiéval | Colombages, églises et châteaux | 30 |
| 3 | Industriel | Briques, cheminées et gares | 60 |
| 4 | Moderne | Tours, éoliennes et parcs | 110 |
| 5 | Futuriste | Arcologies, maglev et fusées | 180 |

### Conditions pour atteindre l'âge `n` (en Facile et Bac à sable)
Tout est vérifié par `Sim.ageProgress()` : liste `items` avec `have` / `need`, `ratio` = moyenne de `min(1, have/need)`. Dans l'ordre : habitants, bâtiments (`reqKinds`), minerai, briques, or (archipel accepté seulement), expéditions obligatoires de l'âge **actuel**, le grand choix (vers le Médiéval), le chapitre du conflit des deux îles (vers l'Industriel, le Moderne et le Futuriste, archipel), bâtiments de fin d'âge (`reqLate`), chemin de fer.

| Pour atteindre | Bâtiments (`reqKinds`) | Minerai | Briques | Or (archipel) | Expéditions obligatoires (à réussir dans l'âge d'avant) | Fin d'âge |
|---|---|---|---|---|---|---|
| Antiquité | house 4, farm 1, well 1, workshop 1 | | | | herd, mammoth | |
| Médiéval | house 8, temple 1, workshop 2, gather 1 | | | | seeds, kraken ; et le grand choix (voir plus bas) | |
| Industriel | house 12, temple 1, mill 1, quarry 1, landmark 1, gather 2, health 1 | 12 | | 20 | mine, dragon, caravel | |
| Moderne | house 18, mill 2, landmark 1, gather 3, farm 2, school 1 | 30 | | 50 | railway, motorcar, oil | `reqLate` : refinery 1, oilwell 2 ; `reqRail` : une première ligne et deux gares reliées |
| Futuriste | house 24, workshop 3, school 2, lab 1, health 1, gather 4 | 50 | 80 | 100 | summit | `reqLate` : airport 1, racetrack 1, powerplant 1 (les étapes de l'époque moderne) |

- Les expéditions obligatoires sont celles de `mandatoriesFor(age)` (`missions.ts`, `mandatory: true` : 11 en tout). L'âge 5 n'en a aucune. L'expédition du portail ne l'est plus : le grand choix du passage au Médiéval ouvre le portail (voir [grand-choix.md](grand-choix.md)).
- Le minerai et les briques sont comptés **en réserve** (`world.ore`, `world.brick`) : en dépenser fait reculer la condition. En ressources illimitées, ces deux conditions sont réputées remplies.
- **L'or** (`reqGold`, `world.gold`, voir [economie-ressources.md](economie-ressources.md)) : en réserve lui aussi, réputé rempli en ressources illimitées. Il n'existe que si l'archipel est accepté (`archipelagoOn`), et seulement à partir de l'âge qui suit l'acceptation (`goldNeed`, `firstGoldAge`, `trade.ts`) : l'âge d'acceptation est `world.exploredAt` (`goldSince` ; absent alors que la carte a ses îles : 0). Accepté en entrant au Médiéval (le moment où on le propose) ou avant : l'or compte dès l'Industriel. Accepté plus tard, à l'âge `a` : rien pour le passage suivant, l'or compte à partir de l'âge `a + 2` (accepté à l'Industriel : rien pour le Moderne, 100 pour le Futuriste ; accepté au Moderne : jamais). Qui accepte tard n'est donc pas bloqué. Le libellé de la ligne est `GOLD_LABEL` (`sim.ts`) ; un clic ouvre le comptoir, et le conseil y mène (`messageGold`).
- **Les étapes de l'époque moderne** (retour de joueurs : « l'époque moderne passe trop vite », décision de l'auteur du 22 nov. 2026) : pour l'âge futuriste, un aéroport (`airport`, 4 × 4), un circuit automobile (`racetrack`, 3 × 3) et une centrale électrique (`powerplant`, 3 × 3), en fin d'âge (`reqLate`), après les expéditions. Les deux derniers sont nés pour ça (voir [batiments-catalogue.md](batiments-catalogue.md)), et deux petits objectifs de l'époque moderne les annoncent ([objectifs.md](objectifs.md)). Une partie déjà à l'époque moderne ou au-delà quand elles sont arrivées n'est pas retenue : `World.modernSteps` faux, ces trois lignes ne sont pas demandées (`reqKindsOf(n, d, late, modern)`). Une ancienne sauvegarde n'a pas le champ (null) : `modernStepsFor(null, âge)` tranche au chargement (`Game`), dispensée dès l'âge 4. Une partie neuve et une partie d'avant l'époque moderne les ont.
- La raffinerie est débloquée par l'expédition `oil` ; la fin d'âge (`reqLate`, rail) ne vient qu'après les expéditions dans la liste, c'est l'ordre du conseil.
- Un bâtiment **amélioré** compte pour son genre d'origine (`lineOf`, `UPGRADES` : une gare devenue gare centrale reste une gare ; une maison devenue manoir reste une maison).
- **Le grand choix** (Médiéval seulement) : la ligne « le grand choix » (`CHOICE_LABEL`), remplie quand le joueur a répondu à la carte (les Enfers, le monde, ou ni l'un ni l'autre), quand une voie est déjà prise ou qu'aucune n'est possible. La carte s'ouvre quand toutes les autres lignes sont remplies ; un clic sur la ligne ou sur le conseil la rouvre. Voir [grand-choix.md](grand-choix.md).
- L'île du portail, l'invasion et les Enfers sont **facultatifs** et ne conditionnent plus le passage (commit 66acbf4).
- **L'archipel** (le fil des âges, 24 nov. 2026) : une partie qui a accepté l'archipel doit faire **le chapitre du conflit des deux îles de chaque âge**, du Médiéval au Moderne : vers l'Industriel, « le conflit des deux îles : le chapitre du Médiéval » (la guerre : les éclaireurs, le débarquement, la première sortie repoussée ; la paix : les émissaires et la trêve) ; vers le Moderne, « … : le chapitre de l'Industriel » (le port et la tour ; un second comptoir) ; vers le Futuriste, « le conflit des deux îles, réglé » (l'assaut ; l'ambassade et la paix signée). Lignes `chapterItem` (`sim/saga.ts`), cliquables (carte, feuille de route, ou bataille), comme le grand choix ; le chapitre est la dernière condition qui manque, la feuille de route s'ouvre d'elle-même. Un conflit déjà réglé remplit les trois. Une arrivée tardive dans l'archipel rattrape les chapitres passés à la suite : la condition les demande avec celui de l'âge. Au Futuriste, aucune condition, mais le conflit se mène encore jusqu'au bout. Pas de passage d'âge pendant la bataille. Voir [diplomatie.md](diplomatie.md), « Le fil des âges ».
- Un bâtiment bâti avant d'être demandé compte déjà.

### Variante Normal (`newOnly`)
- `reqKindsOf(n, difficulté, late)` : en Normal, l'âge `n` ne demande que **l'excédent** sur ce que les âges d'avant demandaient déjà (`usedBefore` = maximum de `reqKinds` et `reqLate` des âges 0 à `n−1`). Exemples (Moderne) : house 18 − 12 = 6, mill 2 − 1 = 1, landmark 0 (plus demandé), gather 1, farm 1, school 1.
- Passé la Préhistoire, les bâtiments d'avant qui ont servi aux âges passés ne comptent plus : `have = total − min(world.ageBase[genre], usedBefore)`. `world.ageBase` = le `counts` du village au moment de `advance()`, sauvegardé avec le monde. Les libellés deviennent « Nom (en plus) » (`DIFF_TEXT.more`).
- Les bâtiments bâtis en avance, avant que le jeu ne les demande, comptent déjà.

### Ce qui se passe au passage (`Sim.advance` puis `Game.sim.onAgeUp`, `main.ts`)
1. `advance()` : recalcul, vérifie `ageProgress` ; si tout est réuni, demande son dernier mot à `beforeAdvance(next)` (posé par `main.ts` : pas de passage pendant la bataille de l'archipel, voir [diplomatie.md](diplomatie.md)), puis `age = next`, `world.ageBase = counts`, appelle `onAgeUp`, recalcule le conseil. Renvoie faux sinon.
2. `onAgeUp` : vide les piles Annuler / Rétablir (rejouer un passage d'âge ferait compter des bâtiments comme neufs) ; `war.ageUp(age)` (garnison) ; bannière « Nouvel âge : … » ; après 3,6 s, la **fenêtre des nouveaux bâtiments** (`ui.showNewAge`) ; son de passage ; `terrain.gardenAge = age` et recoloration du sol (jardins) ; `propsDirty`.
3. **Fenêtre des nouveaux bâtiments** (`showNewAge`) : tuiles des genres dont `minAge === age` et qui ne sont pas verrouillés (`lockOf`), un clic ouvre le bâtiment en main ; puis, grisés, ceux d'âge ≤ `age` qu'une expédition doit encore débloquer (`reqMission` non réussie, et pas déjà périmés par `maxAge`), un clic mène à l'expédition. Aucune fenêtre s'il n'y a rien à montrer.
4. **Évolution des modèles** (`render/buildings.ts` › `update(dt, worldAge)`) : toutes les 0,06 s, un bâtiment dont `b.age < worldAge` démarre l'animation `evolve` (écrasement 0,3 s, échange de modèle, rebond jusqu'à 0,8 s) et reçoit `b.age = worldAge`. Les bâtiments ruinés sont sautés. Les capacités de besoins suivent `b.age` (voir [besoins-population.md](besoins-population.md)). Les modèles et les vignettes du nouvel âge sont en général déjà prêts : ils se préparent au repos dès que les conditions sont réunies (`AgePrep`, voir [chargement-performances.md](chargement-performances.md)).
5. Les autres systèmes lisent `Sim.age` à chaque image : secours (voir ci-dessous), tracteur et engins des champs (`fields.ts` : `MACHINE_AGE = 1`, `TRACTOR_AGE = 3`, `DRONE_AGE = 5`), habitants, véhicules, soldats. Les secours animés n'existent qu'à partir de l'âge 3 et n'ont d'automobiles qu'avec l'usine automobile ([incidents.md](incidents.md)).

### Disponibilité des bâtiments
- `KINDS[k].minAge` : en dessous, verrouillé (« Disponible à l'âge : … »). `maxAge` : au-delà, on ne le bâtit plus (acropole, forum et sénat : `maxAge = 1`) ; ceux déjà bâtis restent.
- Autres verrous : `reqMission` (expédition réussie), `reqKind` (un autre bâtiment présent : l'usine automobile veut une raffinerie), tutoriel guidé, premier bâtiment obligé (la place du village).

### Affichage
- `#agePanel` : nom et devise, barre `ratio`, « Vers X » et « n/m conditions » ; clic : la liste dépliée (chaque ligne cliquable : bâtir le genre, ou ouvrir l'expédition / la fiche du minerai ou de l'or, le rail ; le geste de chaque ligne vient de `ageGo(item)` (`sim.ts`), d'après ses champs : `kind`, `missionId` (l'identifiant de l'expédition, posé en `data-m`), sinon le libellé interne ; les briques prennent la briqueterie en main dans le rayon du bas, comme une condition de bâtiment, au lieu d'ouvrir leur fiche en haut : deux conduites pour la même sorte de condition, 17 nov. 2026). Bouton `#ageGo` quand `Sim.ready`.
- Les briques ne sont plus demandées pour passer à l'époque moderne (décision de l'auteur, 17 nov. 2026) : seulement pour l'âge futuriste (80).
- Une briqueterie est demandée pour passer à l'époque moderne (`AGES[4].reqKinds.brickworks`, décision de l'auteur, 24 nov. 2026) : le bâtiment, pas un stock de briques.
- Au dernier âge : « Dernier âge atteint », `ageProgress()` renvoie `null`, le conseil passe à la conquête de l'espace ([fin-de-partie.md](fin-de-partie.md)). Le panneau des âges déplié montre « Pour finir le jeu » (`UI.endRoad`) : le cosmodrome, le premier vol, la Lune, la centrale à fusion, la colonie, cochés au fur et à mesure et cliquables ; « profitez de votre village » seulement la colonie fondée (avant, il s'affichait dès l'âge atteint).

## Fonctionnement dans le code
- `ageProgress()` construit `items` à chaque appel (appelé par `ui.update`, `ready`, `computeMessage`, `advance` : pas de cache, rester léger).
- `Sim.ready` : `ageProgress()` non nul et chaque item `have >= need`.
- Le clic sur le conseil prêt appelle aussi `advance()` (`#msg.onclick`, `ui.ts`).
- Une sauvegarde stocke `age` (`save.age`, `main.ts`) et `world.ageBase`. Chargement : `sim.age = save.age`.

## Liens avec les autres systèmes
- Coûts et apports par âge : [economie-ressources.md](economie-ressources.md), [batiments-catalogue.md](batiments-catalogue.md).
- Rendu : modèles par âge ([rendu-modeles.md](rendu-modeles.md)).
- Guerre : `war.ageUp`, unités par âge ([armee-combat.md](armee-combat.md)).
- Expéditions : obligatoires par âge, déblocage de bâtiments ([expeditions.md](expeditions.md)).
- Tutoriel : verrous de bâtiments ([tutoriel.md](tutoriel.md)).
- Petits objectifs : une liste par âge, entre les conditions, avec récompense ([objectifs.md](objectifs.md)).

## Pièges et invariants
- Pas de retour en arrière d'âge : ne pas permettre Annuler par-dessus un passage (`onAgeUp` vide les piles).
- `usedBefore` prend le **maximum** sur les âges précédents, pas la somme : ne pas « corriger » en additionnant.
- Ajouter un âge : `AGES`, les tableaux par âge de **chaque** bâtiment (`names`, `housing`…, prolongés au besoin), `YIELD`, les modèles, les textes d'âge.
- Reste dans `Sim.computeMessage` du code lié à l'ancienne condition « île du portail » (étiquette `'île du portail'`), qui ne correspond plus à aucun item. Sans effet, à nettoyer.
- La liste dépliée (`#ageReq`) n'est réécrite que si son HTML change, et jamais pendant un appui (`:active`) : refaite à chaque tick de l'interface (4 fois par seconde), elle remplaçait la ligne entre l'appui et le relâchement, le clic tombait sur le panneau et repliait la liste sans rien ouvrir (retour de joueur, 22 nov. 2026). Les expéditions se retrouvaient aussi par leur titre lu dans le texte : en anglais, aucune ne répondait (`tests/conditionsAge.test.ts`).
- À vérifier : les capacités des bâtiments (`b.age`) montent pendant l'animation d'évolution sans que `world.version` change ; elles peuvent ne se refléter dans les jauges qu'au prochain changement du village.

## Pour modifier
- **Changer une condition** : `AGES[n]` (`catalog.ts`) ; pour l'or, aussi `firstGoldAge` (`trade.ts`) ; la variante Normal se déduit toute seule ; mettre à jour `tests/difficulty.test.ts` (` passage d'âge en Normal`) et le conseil si c'est un nouveau type de condition (`ageProgress` + `computeMessage` + `ageGo` et le clic de `#agePanel` dans `ui.ts` + traduction).
- **Rendre une expédition obligatoire** : `mandatory: true` dans `MISSIONS` ; elle apparaît d'elle-même dans les conditions (`mandatoriesFor`).
- **Ajouter un bâtiment à un âge** : `minAge` et tableaux par âge dans `KINDS` ; la fenêtre de nouveaux bâtiments le liste seule.
