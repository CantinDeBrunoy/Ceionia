# Les âges

> Fichiers : `src/build/catalog.ts` (`AGES`, `AgeDef`, `minAge` / `maxAge`), `src/sim/sim.ts` (`ageProgress`, `reqKindsOf`, `usedBefore`, `advance`, `ready`), `src/sim/missions.ts` (`mandatoriesFor`), `src/main.ts` (`sim.onAgeUp`), `src/render/buildings.ts` (évolution des modèles), `src/ui/ui.ts` (`#agePanel`, `showNewAge`, `lockOf`), `src/sim/difficulty.ts` (`newOnly`).
> Tests : `tests/difficulty.test.ts` (passage d'âge en Normal), `tests/baseAges.test.ts`, `tests/rail.test.ts`, `tests/briques.test.ts`.
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
Tout est vérifié par `Sim.ageProgress()` : liste `items` avec `have` / `need`, `ratio` = moyenne de `min(1, have/need)`. Dans l'ordre : habitants, bâtiments (`reqKinds`), minerai, briques, expéditions obligatoires de l'âge **actuel**, bâtiments de fin d'âge (`reqLate`), chemin de fer.

| Pour atteindre | Bâtiments (`reqKinds`) | Minerai | Briques | Expéditions obligatoires (à réussir dans l'âge d'avant) | Fin d'âge |
|---|---|---|---|---|---|
| Antiquité | house 4, farm 1, well 1, workshop 1 | | | herd, mammoth | |
| Médiéval | house 8, temple 1, workshop 2, gather 1 | | | seeds, kraken, portal (si la carte a un portail) | |
| Industriel | house 12, temple 1, mill 1, quarry 1, landmark 1, gather 2, health 1 | 12 | | mine, dragon, caravel | |
| Moderne | house 18, mill 2, landmark 1, gather 3, farm 2, school 1 | 30 | 40 | railway, motorcar, oil | `reqLate` : refinery 1, oilwell 2 ; `reqRail` : une première ligne et deux gares reliées |
| Futuriste | house 24, workshop 3, school 2, lab 1, health 1, gather 4 | 50 | 80 | summit | |

- Les expéditions obligatoires sont celles de `mandatoriesFor(age)` (`missions.ts`, `mandatory: true` : 12 en tout). L'âge 5 n'en a aucune. `portal` n'est demandé que si `world.portal` existe.
- Le minerai et les briques sont comptés **en réserve** (`world.ore`, `world.brick`) : en dépenser fait reculer la condition. En ressources illimitées, ces deux conditions sont réputées remplies.
- La raffinerie est débloquée par l'expédition `oil` ; la fin d'âge (`reqLate`, rail) ne vient qu'après les expéditions dans la liste, c'est l'ordre du conseil.
- Un bâtiment **amélioré** compte pour son genre d'origine (`lineOf`, `UPGRADES` : une gare devenue gare centrale reste une gare ; une maison devenue manoir reste une maison).
- L'île du portail, l'invasion et les Enfers sont **facultatifs** et ne conditionnent plus le passage (commit 66acbf4).
- Un bâtiment bâti avant d'être demandé compte déjà.

### Variante Normal (`newOnly`)
- `reqKindsOf(n, difficulté, late)` : en Normal, l'âge `n` ne demande que **l'excédent** sur ce que les âges d'avant demandaient déjà (`usedBefore` = maximum de `reqKinds` et `reqLate` des âges 0 à `n−1`). Exemples (Moderne) : house 18 − 12 = 6, mill 2 − 1 = 1, landmark 0 (plus demandé), gather 1, farm 1, school 1.
- Passé la Préhistoire, les bâtiments d'avant qui ont servi aux âges passés ne comptent plus : `have = total − min(world.ageBase[genre], usedBefore)`. `world.ageBase` = le `counts` du village au moment de `advance()`, sauvegardé avec le monde. Les libellés deviennent « Nom (en plus) » (`DIFF_TEXT.more`).
- Les bâtiments bâtis en avance, avant que le jeu ne les demande, comptent déjà.

### Ce qui se passe au passage (`Sim.advance` puis `Game.sim.onAgeUp`, `main.ts`)
1. `advance()` : recalcul, vérifie `ageProgress` ; si tout est réuni, `age = next`, `world.ageBase = counts`, appelle `onAgeUp`, recalcule le conseil. Renvoie faux sinon.
2. `onAgeUp` : vide les piles Annuler / Rétablir (rejouer un passage d'âge ferait compter des bâtiments comme neufs) ; `war.ageUp(age)` (garnison) ; bannière « Nouvel âge : … » ; à l'âge 1, si le portail n'est pas ouvert et existe, une info mène à l'expédition du portail (après 6,5 s) ; après 3,6 s, la **fenêtre des nouveaux bâtiments** (`ui.showNewAge`) ; son de passage ; `terrain.gardenAge = age` et recoloration du sol (jardins) ; `propsDirty`.
3. **Fenêtre des nouveaux bâtiments** (`showNewAge`) : tuiles des genres dont `minAge === age` et qui ne sont pas verrouillés (`lockOf`), un clic ouvre le bâtiment en main ; puis, grisés, ceux d'âge ≤ `age` qu'une expédition doit encore débloquer (`reqMission` non réussie, et pas déjà périmés par `maxAge`), un clic mène à l'expédition. Aucune fenêtre s'il n'y a rien à montrer.
4. **Évolution des modèles** (`render/buildings.ts` › `update(dt, worldAge)`) : toutes les 0,06 s, un bâtiment dont `b.age < worldAge` démarre l'animation `evolve` (écrasement 0,3 s, échange de modèle, rebond jusqu'à 0,8 s) et reçoit `b.age = worldAge`. Les bâtiments ruinés sont sautés. Les capacités de besoins suivent `b.age` (voir [besoins-population.md](besoins-population.md)).
5. Les autres systèmes lisent `Sim.age` à chaque image : secours (voir ci-dessous), tracteur et engins des champs (`fields.ts` : `MACHINE_AGE = 1`, `TRACTOR_AGE = 3`, `DRONE_AGE = 5`), habitants, véhicules, soldats. Les secours animés n'existent qu'à partir de l'âge 3 et n'ont d'automobiles qu'avec l'usine automobile ([incidents.md](incidents.md)).

### Disponibilité des bâtiments
- `KINDS[k].minAge` : en dessous, verrouillé (« Disponible à l'âge : … »). `maxAge` : au-delà, on ne le bâtit plus (acropole, forum et sénat : `maxAge = 1`) ; ceux déjà bâtis restent.
- Autres verrous : `reqMission` (expédition réussie), `reqKind` (un autre bâtiment présent : l'usine automobile veut une raffinerie), tutoriel guidé, premier bâtiment obligé (la place du village).

### Affichage
- `#agePanel` : nom et devise, barre `ratio`, « Vers X » et « n/m conditions » ; clic : la liste dépliée (chaque ligne cliquable : bâtir le genre, ou ouvrir l'expédition / la fiche de minerai, briques, rail). Bouton `#ageGo` quand `Sim.ready`.
- Au dernier âge : « Dernier âge atteint », `ageProgress()` renvoie `null`, le conseil passe à la conquête de l'espace ([fin-de-partie.md](fin-de-partie.md)).

## Fonctionnement dans le code
- `ageProgress()` construit `items` à chaque appel (appelé par `ui.update`, `ready`, `computeMessage`, `advance` : pas de cache, rester léger).
- `Sim.ready` : `ageProgress()` non nul et chaque item `have >= need`.
- Le clic sur le conseil prêt appelle aussi `advance()` (`#msg.onclick`, `ui.ts`).
- Une sauvegarde stocke `age` (`save.age`, `main.ts`) et `world.ageBase`. Chargement : `sim.age = save.age`.

## Liens avec les autres systèmes
- Coûts et apports par âge : [economie-ressources.md](economie-ressources.md), [batiments-catalogue.md](batiments-catalogue.md).
- Rendu : modèles par âge ([rendu-modeles.md](rendu-modeles.md)), jardins ([jardins.md](jardins.md)).
- Guerre : `war.ageUp`, unités par âge ([armee-combat.md](armee-combat.md)).
- Expéditions : obligatoires par âge, déblocage de bâtiments ([expeditions.md](expeditions.md)).
- Tutoriel : verrous de bâtiments ([tutoriel.md](tutoriel.md)).

## Pièges et invariants
- Pas de retour en arrière d'âge : ne pas permettre Annuler par-dessus un passage (`onAgeUp` vide les piles).
- `usedBefore` prend le **maximum** sur les âges précédents, pas la somme : ne pas « corriger » en additionnant.
- Ajouter un âge : `AGES`, les tableaux par âge de **chaque** bâtiment (`names`, `housing`…, prolongés au besoin), `YIELD`, les modèles, les textes d'âge.
- Reste dans `Sim.computeMessage` et `ui.ts › reqOf` du code lié à l'ancienne condition « île du portail » (étiquette `'île du portail'`), qui ne correspond plus à aucun item. Sans effet, à nettoyer.
- À vérifier : les capacités des bâtiments (`b.age`) montent pendant l'animation d'évolution sans que `world.version` change ; elles peuvent ne se refléter dans les jauges qu'au prochain changement du village.

## Pour modifier
- **Changer une condition** : `AGES[n]` (`catalog.ts`) ; la variante Normal se déduit toute seule ; mettre à jour `tests/difficulty.test.ts` (` passage d'âge en Normal`) et le conseil si c'est un nouveau type de condition (`ageProgress` + `computeMessage` + `reqOf` dans `ui.ts` + traduction).
- **Rendre une expédition obligatoire** : `mandatory: true` dans `MISSIONS` ; elle apparaît d'elle-même dans les conditions (`mandatoriesFor`).
- **Ajouter un bâtiment à un âge** : `minAge` et tableaux par âge dans `KINDS` ; la fenêtre de nouveaux bâtiments le liste seule.
