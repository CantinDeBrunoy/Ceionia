# Poser, tourner, déplacer, démolir, annuler

> Fichiers : `src/build/tools.ts` (`ToolController` : outils, fantôme, annulation), `src/world/world.ts` (`canPlace`, `place`, `upgrade`, `removeBuilding`, `flatTarget`, `snapshot`/`restore`), `src/build/placement.ts` (orientation, emprise, portes), `src/build/zones.ts` (surbrillance des emplacements), `src/build/startLock.ts` (verrou de départ), `src/render/upgradeBadges.ts` (pastilles ⬆), `src/ui/ui.ts` (`lockOf`, fiche, barre), `src/main.ts` (raccourcis, `ToolHost`)
> Tests : `tests/zones.test.ts`, `tests/verrouDepart.test.ts`, `tests/place.test.ts`, `tests/world.test.ts`, `tests/lots.test.ts`, `tests/voletMilitaire.test.ts`
> Voir aussi : [batiments-catalogue.md](batiments-catalogue.md), [routes.md](routes.md), [remparts.md](remparts.md), [outils-terrain.md](outils-terrain.md), [interface.md](interface.md), [tutoriel.md](tutoriel.md), [portail-ile.md](portail-ile.md)

## En bref
Le joueur prend un bâtiment dans le menu Bâtir (outil `build`) ; un fantôme suit le curseur, vert ou rouge selon `World.canPlace`. Un clic pose (`tryPlace`), paie, aplanit le sol sous l'emprise et, si le réglage est actif, trace un chemin d'accès (`autoRoad`). Déplacer, démolir, tourner et améliorer passent par la fiche du bâtiment ou par les outils rapides. Tout est annulable avec Ctrl+Z (pile d'instantanés).

## Règles du jeu
**Poser**
- Le fantôme montre le modèle de l'âge courant, une tuile verte ou rouge sous l'emprise (`marker`) et une flèche jaune devant la façade (l'entrée) ; pas de flèche pour `lamp`, `gather`, `wall`, `gate` (`hasDoor`). La fiche du coin montre la raison du refus (`placeWhy`, ligne « ✗ »).
- Un clic refusé affiche un message (au plus un toutes les 1,2 s). Un manque de moyens donne « Il faut X bois… (vous avez …) » (`shortLabel`).
- **Emprise** : le point visé est le centre pour les tailles 2 et 4 (arrondi au sommet), la case du milieu pour la taille 3, la case visée pour la taille 1 (`footprintOrigin`).
- **Refus de `World.canPlace`**, dans l'ordre où le code les teste (texte exact dans `world.ts`) :
  1. « Hors de la carte » ; 2. par case de l'emprise : « Emplacement occupé », « Une route est déjà ici » (sauf `lamp` et `gate`), « Devant la porte d'un bâtiment : son chemin passe ici » (la case devant la porte reste libre ; un pan de rempart devant une tour de garde est permis), « Une grotte ou une faille est ici », « Un lac est ici », « Trop proche de l'eau : reculez sur la terre ferme » (`cellMin < 0,05`), et pour le port « L'eau est trop profonde ici pour un quai » (`cellAvg < -0,9`) ;
  3. île du portail (`portalRule`) : sur l'île, seules les défenses (`DEFENSES`), posées tout entières sur l'île, une fois le portail ouvert ; rien sur le portail ;
  4. porte de rempart sur une rue : seulement une rue droite ;
  5. contraintes de zone : mine, club alpin (`MOUNTAIN_H = 2,4`, grosse montagne `ALPINE_PEAK = 5,2` à `ALPINE_REACH = 7`), bûcheron (au moins 5 cases de forêt à 3 cases), carrière (2 cases de rochers à 3 cases, ou montagne), puits de pétrole (gisement), ponton (une case d'eau voisine), bâtiments de mer (`SEASIDE`, eau à `SEA_REACH = 5` cases), port (un côté touche l'eau, un pied sur la rive, quai au plus à 0,6 au-dessus de l'eau) ;
  6. « Terrain trop pentu » : écart entre le niveau d'aplanissement (`flatTarget`) et les coins le plus haut ou le plus bas supérieur à `0,85 × taille × tolérance` (tolérance 1,7 pour mine, carrière, club alpin ; 2,2 pour le port ; 1 sinon) ;
  7. niveau d'aplanissement sous 0,05 : de nouveau « Trop proche de l'eau ».
- Le ponton peut avoir les pieds dans l'eau (`cellAvg >= 0,05` requis seulement pour lui) ; le port mord dans l'eau peu profonde.
- **Surbrillance des zones** (`ZoneHighlight`) : pour les genres de `ZONED`, un voile doré sur toutes les emprises valides (vert pour bûcheron et carrière, qui restent affichés après la pose). Calculée par tranches de 3000 emprises par image (`BUDGET`) ; si aucune emprise n'existe, un message dit ce qui manque (`ZoneScan.emptyMessage`).
- **Sol** : à la pose, les sommets de l'emprise sont mis à la hauteur `flatTarget` (moyenne, ou hauteur des coins déjà tenus par un voisin pour rester raccordé) ; le port creuse son bassin (`dredge`) et remblaie son quai (`QUAY_MAX = 0,32`).
- **Verrou de départ** (`startLock.ts`) : tant que `world.buildings.size === 0`, seul le feu de camp (`START_KIND = 'gather'`) se pose ; outils de relief, nature, routes, démolition, déplacement, onglets et rayons sont refusés avec « Posez d'abord … : c'est la place du village » (`startRefusal`). La touche B sans bâtiment précisé prend d'office la place. Vaut aussi en bac à sable.
- **Poser un rempart** : voir [remparts.md](remparts.md) (tracé A → B).

**Tourner**
- R (ou T) tourne le bâtiment en main d'un quart de tour, sinon le bâtiment choisi (`rotate`). Sans geste du joueur, la façade se tourne seule vers la route (`facingRoadRot`, `Building.auto = true`). Une rotation manuelle met `auto = false` (`rotManual`) ; changer d'outil ou de bâtiment remet la rotation automatique.
- `World.rotateBuilding` ne change pas l'emprise ; les maisons voisines sont rafraîchies (blocs de façade).

**Déplacer**
- Outil Déplacer (M) puis un clic sur un bâtiment, ou bouton « Déplacer » de la fiche (`moveSelected`) : le bâtiment est retiré du monde (`pickUp`) et suit le curseur ; un clic le repose gratuitement (coût `null`), Échap le remet en place (`cancelMove`, refusé en silence si l'emplacement est pris). La rotation et le mode auto d'origine sont gardés ; l'âge devient celui du village.
- Un chemin d'accès est de nouveau tracé à la repose (l'ancien reste).

**Démolir**
- Outil Démolir (X). Sans pinceau large (rayon 1), un clic enlève le bâtiment visé, sinon la route, sinon le décor (grotte, faille), sinon la végétation. Le volcan sous le curseur est rasé.
- Pinceau large (`radius > 1`) : disque qui efface routes, plantations et **petits bâtiments (taille 1)** ; les bâtiments de taille 2 et plus restent dans le disque (« Les grands bâtiments se démolissent un à un »), sauf celui qui est sous le curseur au moment du clic, qui part aussi.
- Le bouton « Démolir » de la fiche démolit sans confirmation. Plus de double confirmation depuis le commit « Démolition sans double confirmation » ; Ctrl+Z annule.
- Démolir ne rend aucune ressource.

**Annuler / rétablir**
- Ctrl+Z, Maj+Ctrl+Z ou Ctrl+Y (`main.ts`). Pile de 60 instantanés (`undoStack`, `redoStack`), un par geste (glissé, pose, démolition, amélioration). L'instantané (`World.snapshot`) contient hauteurs, routes, végétation, biomes peints, bâtiments, bois, pierre, courbes de route. Annuler une pose rend donc le bois et la pierre.
- Un passage d'âge vide les deux piles (`sim.onAgeUp`, dans `main.ts`).

**Améliorer**
- Sur la fiche d'un bâtiment qui a une ligne dans `UPGRADES` : bouton « Améliorer : nom » avec taille et prix, ou grisé avec la raison (expédition, bâtiment à avoir). `upgradeSelected` paie, puis `World.upgrade` remplace le bâtiment sur place : si le nouveau est plus grand, l'emprise s'étend sur l'une des places qui contiennent l'ancienne, de préférence vers l'arrière ; sinon message « Pas assez de place libre autour… ». Il garde sa rotation et son âge (au moins `minAge`), et les lignes de train qui s'y arrêtaient.
- **Pastilles ⬆** (`UpgradeBadges`) : un disque doré au-dessus de chaque bâtiment améliorable *et payable* (âge atteint, expédition faite, bâtiment requis présent, ressources suffisantes). Un seul nuage de points, recalculé quand `w.version`, l'âge, le bois, la pierre, les briques ou le nombre d'expéditions changent. Case à cocher « Afficher les flèches d'amélioration » dans la fiche (même réglage que Réglages › Partie, `hideUpBadges` dans les réglages).

## Fonctionnement dans le code
- `ToolController` (`tools.ts`) reçoit les événements du pointeur de `CameraRig` (`down`, `move`, `up`, `hover`, `update`) et un `ToolHost` (monde, terrain, caméra, `getAge`, `toast`, `changed`, `autoRoads`). `main.ts` l'enveloppe : `setTool` depuis les Enfers ou l'île passe d'abord par `ensureSurface`.
- **Geste** : `down` → `beginStroke` (instantané `pre`) ; `mark()` pousse `pre` dans `undoStack` au premier changement du geste ; `up` → `endStroke`. Souris : `tryPlace` à l'appui ; tactile : au relâcher (on peut faire glisser le fantôme).
- **`tryPlace`** : `canPlace` → `priceIn`/`canPay` → `mark()` → `pay` → `facingRoadRot` (si `!rotManual`) → `World.place` → `autoRoad` si `h.autoRoads` → son. Le coût est nul pour un déplacement.
- **Aperçu** (`refreshVisuals`) : le modèle fantôme est celui de `getModel(kind, age, …)`, recalculé quand `kind|age` change ; `setGhostValid` teinte la lueur.
- **Choix du bâtiment visé** : `buildingOnRay` suit le rayon par pas de 0,12 sur les 40 dernières unités et compare à la hauteur du modèle (`topOf`, mise en cache par genre, âge, taille) : un grand bâtiment vu de biais se vise sur sa façade.
- **Orientation** (`placement.ts`) : `facingRoadRot` compte les cases de route le long de chaque côté (une demi-case de plus si la porte donne dessus), sinon prend la route la plus proche à 4 cases (`nearRoadSide`) ; ponton et port s'orientent vers l'eau, leur porte est à l'arrière (`doorSide`).
- **Porte** : au milieu du côté de façade, une case (deux pour une emprise paire : `doorSpan`, `doorCells`). `World.doorOf(cx, cz)` dit quel bâtiment a sa porte sur une case ; c'est elle qui réserve la case.
- **Sélection** (`selected`) : outil Voir (`none`), un clic relâché presque sans bouger (moins de 8 px) ; la fiche (`renderSelection`, `ui.ts`) propose Déplacer, Tourner, Démolir, Améliorer, et pour les gares « Nouvelle ligne ».

## Liens avec les autres systèmes
- Routes automatiques à la pose : [routes.md](routes.md). Le tracé de remparts : [remparts.md](remparts.md).
- Prix : [batiments-catalogue.md](batiments-catalogue.md) (`costOf`/`priceIn`), [economie-ressources.md](economie-ressources.md).
- Île du portail : seules les défenses s'y posent, [portail-ile.md](portail-ile.md).
- Tutoriel : `Tutorial.lock` verrouille les vignettes (voir `lockOf`) ; le tutoriel compte l'outil pris puis quitté, [tutoriel.md](tutoriel.md).
- Relief : un pinceau de relief qui touche un bâtiment ne change rien (`brushOnBuilding`), [outils-terrain.md](outils-terrain.md).

## Pièges et invariants
- **Les briques ne sont pas dans l'instantané** : `snapshot`/`restore` gardent bois et pierre, pas `w.brick`. Annuler la pose d'une gare, d'une usine automobile ou d'une raffinerie (prix en briques) ne rend pas les briques ; idem pour une amélioration payée en briques. Bug probable, à corriger dans `World.snapshot`.
- Même cause : l'instantané ne contient pas les lignes de chemin de fer, ni l'état des habitants ; annuler après avoir tracé une ligne peut laisser une ligne dont un arrêt n'existe plus (`restore` rétablit les bâtiments, pas `lines`). À vérifier.
- `ToolController.confirmed`, `doomed` et `showSpots` sont du code mort (plus de confirmation de démolition, plus de points verts) ; ne pas les croire actifs.
- « Occupé » juste après une pose : tant que le curseur reste sur la case du bâtiment qu'on vient de poser, le refus « Emplacement occupé » est masqué (`placedAt`).
- Un geste ne doit pousser qu'un instantané : toujours `mark()` avant de modifier, jamais après (`upgradeSelected` remet `pre` à la main parce que `beginStroke` y est appelé avant la tentative).
- Un déplacement retire le bâtiment du monde avant de le reposer : pendant ce temps, les besoins (logement, vivres…) sont recalculés sans lui.
- `upgrade` libère temporairement l'ancienne emprise (`occ = 0`) pour tester `canPlace` ; ne pas y insérer d'`await` ni de rappel.
- La ligne d'une amélioration ne contrôle pas `maxAge` ni la contrainte de zone du nouveau genre au-delà de `canPlace`.
- `World.canPlace` ne vérifie ni l'âge, ni les expéditions, ni le tutoriel : seul `UI.lockOf` le fait (les tests et `World.place` le contournent).
- Coin d'aplanissement : `place` ne touche pas aux sommets tenus par un voisin (`vertexHeld`) ; `repairFootprints` (au chargement et à `restore`) recolle les emprises devenues non planes.

## Pour modifier
- **Ajouter un refus de pose** : le coder dans `World.canPlace` (texte via `tr`), l'ajouter à `GENERIC` dans `zones.ts` s'il ne dit rien du bâtiment en main (sinon il remonte dans le message « Aucun emplacement »), puis à `src/i18n/en/gear.ts` (section « pose des bâtiments : raisons de refus »).
- **Nouvelle contrainte de zone** : `ZONED` (message) + `canPlace` (règle) + test dans `tests/zones.test.ts` (la liste suit `canPlace`).
- **Rendre un nouveau geste annulable** : appeler `beginStroke()`, `mark()` avant la modification, `endStroke()` après.
- **Nouveau raccourci** : `bindKeys` dans `main.ts` (table `map` : touche → outil).
