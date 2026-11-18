# Poser, tourner, déplacer, démolir, annuler

> Fichiers : `src/build/tools.ts` (`ToolController` : outils, fantôme, annulation), `src/world/world.ts` (`canPlace`, `place`, `upgrade`, `removeBuilding`, `flatTarget`, `snapshot`/`restore`), `src/build/placement.ts` (orientation, emprise, portes), `src/build/zones.ts` (surbrillance des emplacements), `src/build/startLock.ts` (verrou de départ), `src/render/upgradeBadges.ts` (pastilles ⬆), `src/ui/ui.ts` (`lockOf`, fiche, barre), `src/main.ts` (raccourcis, `ToolHost`)
> Tests : `tests/zones.test.ts`, `tests/verrouDepart.test.ts`, `tests/place.test.ts`, `tests/world.test.ts`, `tests/lots.test.ts`, `tests/voletMilitaire.test.ts`, `tests/controlesPose.test.ts`
> Voir aussi : [batiments-catalogue.md](batiments-catalogue.md), [routes.md](routes.md), [remparts.md](remparts.md), [outils-terrain.md](outils-terrain.md), [interface.md](interface.md), [tutoriel.md](tutoriel.md), [portail-ile.md](portail-ile.md)

## En bref
Le joueur prend un bâtiment dans le menu Bâtir (outil `build`) ; un fantôme suit le curseur, vert ou rouge selon `World.canPlace`. Un bâtiment à porte se pose en deux clics : l'endroit, puis le côté de l'entrée ; les autres d'un clic. La pose (`tryPlace`), paie, aplanit le sol sous l'emprise et, si le réglage est actif, trace un chemin d'accès (`autoRoad`). Déplacer, démolir, tourner et améliorer passent par la fiche du bâtiment ou par les outils rapides. Tout est annulable avec Ctrl+Z (pile d'instantanés).

## Règles du jeu
**Poser**
- Le fantôme montre le modèle de l'âge courant, une tuile verte ou rouge sous l'emprise (`marker`) et **l'entrée en or** (`showDoor`, retour de l'auteur du 16 nov. 2026 : la flèche jaune d'avant ne se lisait pas) : un seuil doré qui bat sur les cases devant la porte (`doorCells`, une ou deux cases), un cadre de porte en arc debout contre la façade (0,62 pour une emprise de 1, 0,85 pour 2, 1,2 au-delà), et trois chevrons qui sortent de la porte sur deux cases et demie, l'un après l'autre (le chemin d'accès esquissé, animé dans `update`). Tout est dessiné sans test de profondeur : visible à travers le fantôme. Le ponton et le port l'ont à l'arrière, côté terre (`doorSide`). Rien pour `lamp`, `gather`, `wall`, `gate` (`hasDoor`). La fiche du coin montre la raison du refus (`placeWhy`, ligne « ✗ »), sinon l'aide de pose (« Un clic : l'endroit, un second : le côté de l'entrée »).
- Un clic refusé affiche un message (au plus un toutes les 1,2 s). Un manque de moyens donne « Il faut X bois… (vous avez …) » (`shortLabel`).
- **Deux clics** (`orientable`, dans `placement.ts` : tout bâtiment à porte sauf ponton et port, que l'eau oriente ; vaut aussi pour Déplacer et les défenses de l'île) : le premier clic vérifie l'endroit (refus et prix comme une pose) et le fixe (`anchor`, petit clic sonore) ; le fantôme y reste et se tourne vers la souris : l'entrée prend le côté de l'emprise qu'elle vise (`sideToward` : le plus grand écart en x ou en z depuis le centre). Tant qu'elle reste près du centre (moins de `max(0,7 ; 0,45 × taille)`), la façade regarde la route comme avant (`facingRoadRot`). Le second clic pose : l'orientation choisie à la souris ou par R est gardée (`auto = false`), près du centre elle reste automatique. Une bulle suit le curseur (« Cliquez du côté de l'entrée », `#cursorHint`). Échap libère l'endroit sans lâcher le bâtiment (sur l'île, un second Échap lâche la défense). Si le village a changé entre les deux clics et que l'endroit ne tient plus, le refus s'affiche et l'endroit se libère. Au doigt, deux touchers.
- **Emprise** : le point visé est le centre pour les tailles 2 et 4 (arrondi au sommet), la case du milieu pour la taille 3, la case visée pour la taille 1 (`footprintOrigin`).
- **Refus de `World.canPlace`**, dans l'ordre où le code les teste (texte exact dans `world.ts`) :
  1. « Hors de la carte » ; 2. par case de l'emprise : « Emplacement occupé », « Une route est déjà ici » (sauf `lamp` et `gate`), « Devant la porte d'un bâtiment : son chemin passe ici » (la case devant la porte reste libre ; un pan de rempart devant une tour de garde est permis), « Une grotte ou une faille est ici », « Un lac est ici », « Trop proche de l'eau : reculez sur la terre ferme » (`cellMin < 0,05`), et pour le port « L'eau est trop profonde ici pour un quai » (`cellAvg < -0,9`) ;
  3. le cosmodrome (`spaceportWhy`) et le comptoir (`tradepostWhy`, `allyLand.ts`) : sur l'île de l'allié quand l'archipel est accepté (le comptoir seulement là) ; puis archipel : chaque case de l'emprise doit être **jouable** (`World.playable`) : l'île principale (`inMain`), et l'île de l'allié une fois l'allié choisi, hors de sa ville de décor (`allyLand`). Refus (`World.playWhy`) : « C'est la ville de vos alliés… » (dans les remparts, sur un lot, un champ, le port ou une rue de `townCells`), « Choisissez d'abord votre allié… » (une île rivale sans allié), « Hors de votre île… » (l'autre île rivale, les petites îles). Les routes (`canRoad`), le relief (`locked` dans `terraform.ts`), les biomes peints (`paintBiome`) et les outils (`ToolController.down`, plantations) suivent la même règle ;
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
- R (ou T) tourne le bâtiment en main d'un quart de tour, sinon le bâtiment choisi (`rotate`). L'endroit fixé (second temps de la pose), R tourne à partir de ce que montre l'aperçu et l'emporte sur la souris tant qu'elle reste du même côté (`anchor.keySide`). Sans geste du joueur, la façade se tourne seule vers la route (`facingRoadRot`, `Building.auto = true`). Une rotation manuelle met `auto = false` (`rotManual`) ; changer d'outil ou de bâtiment remet la rotation automatique.
- `World.rotateBuilding` ne change pas l'emprise ; les maisons voisines sont rafraîchies (blocs de façade).

**Déplacer**
- Outil Déplacer (M) puis un clic sur un bâtiment, ou bouton « Déplacer » de la fiche (`moveSelected`) : le bâtiment est retiré du monde (`pickUp`) et suit le curseur ; un clic le repose gratuitement (coût `null`), Échap le remet en place (`cancelMove`, refusé en silence si l'emplacement est pris). La rotation et le mode auto d'origine sont gardés ; l'âge devient celui du village. En le ramassant, son ancien chemin d'accès s'efface (`unlayAccess`, `autoroads.ts`) ; le nouveau se trace à la pose, et Échap retrace celui d'origine.
- Un chemin d'accès est de nouveau tracé à la repose (l'ancien reste).

**Démolir**
- Outil Démolir (X). Sans pinceau large (rayon 1), un clic enlève le bâtiment visé, sinon la route, sinon le décor (grotte, faille), sinon la végétation. Le volcan sous le curseur est rasé.
- Pinceau large (`radius > 1`) : disque qui efface routes, plantations et **petits bâtiments (taille 1)** ; les bâtiments de taille 2 et plus restent dans le disque (« Les grands bâtiments se démolissent un à un »), sauf celui qui est sous le curseur au moment du clic, qui part aussi.
- Le bouton « Démolir » de la fiche démolit sans confirmation. Plus de double confirmation depuis le commit « Démolition sans double confirmation » ; Ctrl+Z annule.
- Démolir rend une part de son prix à son âge (`refund` de `economy.ts`, part `refund` de la table `DIFFICULTY`) : tout en Facile, la moitié en Normal (arrondie vers le bas, briques comprises), rien en bac à sable ni en ressources illimitées ; un premier producteur offert en Normal ne rend rien. Ce qui est rendu se dit à la fin du geste (« Démolition : … rendus. », `ToolController.strokeBack`, un total pour tout un glissé du pinceau large) ; Ctrl+Z le reprend avec le reste.

**Annuler / rétablir**
- Ctrl+Z, Maj+Ctrl+Z ou Ctrl+Y (`main.ts`). Pile de 60 instantanés (`undoStack`, `redoStack`), un par geste (glissé, pose, démolition, amélioration). L'instantané (`World.snapshot`) contient hauteurs, routes, végétation, biomes peints, bâtiments, bois, pierre, briques, lignes de chemin de fer, courbes de route. Annuler une pose rend donc le bois, la pierre et les briques (gare, usine automobile, raffinerie, amélioration payée en briques). Le minerai, le pétrole et le carburant n'y sont pas : aucun geste annulable ne les dépense. Annuler une gare retire aussi les lignes tracées depuis son instantané ; une ligne dont un arrêt a disparu se replie d'elle-même (`Railway.refresh`).
- Un passage d'âge vide les deux piles (`sim.onAgeUp`, dans `main.ts`).

**Améliorer**
- Sur la fiche d'un bâtiment qui a une ligne dans `UPGRADES` : bouton « Améliorer : nom » avec taille et prix, ou grisé avec la raison (expédition, bâtiment à avoir). `upgradeSelected` paie, puis `World.upgrade` remplace le bâtiment sur place : si le nouveau est plus grand, l'emprise s'étend sur l'une des places qui contiennent l'ancienne, de préférence vers l'arrière ; sinon message « Pas assez de place libre autour… ». Il garde sa rotation et son âge (au moins `minAge`), et les lignes de train qui s'y arrêtaient.
- **Pastilles ⬆** (`UpgradeBadges`) : un disque doré au-dessus de chaque bâtiment améliorable *et payable* (âge atteint, expédition faite, bâtiment requis présent, ressources suffisantes). Un seul nuage de points, recalculé quand `w.version`, l'âge, le bois, la pierre, les briques ou le nombre d'expéditions changent. Case à cocher « Afficher les flèches d'amélioration » dans la fiche (même réglage que Réglages › Partie, `hideUpBadges` dans les réglages).

## Fonctionnement dans le code
- `ToolController` (`tools.ts`) reçoit les événements du pointeur de `CameraRig` (`down`, `move`, `up`, `hover`, `update`) et un `ToolHost` (monde, terrain, caméra, `getAge`, `toast`, `changed`, `autoRoads`). `main.ts` l'enveloppe : `setTool` depuis les Enfers ou l'île passe d'abord par `ensureSurface`.
- **Geste** : `down` → `beginStroke` (instantané `pre`) ; `mark()` pousse `pre` dans `undoStack` au premier changement du geste ; `up` → `endStroke`. Souris : `tryPlace` à l'appui ; tactile : au relâcher (on peut faire glisser le fantôme).
- **`tryPlace`** : `canPlace` → `priceIn`/`canPay` → (bâtiment orientable sans endroit fixé : `anchor`, et rien d'autre) → `mark()` → `pay` → `facingRoadRot` (si `!rotManual`) → `World.place` → `autoRoad` si `h.autoRoads` → son. Le coût est nul pour un déplacement.
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
- L'instantané ne contient ni l'état des habitants ni les stocks qui varient avec le temps autres que bois, pierre et briques. Un tracé de ligne n'est pas un geste annulable à lui seul : Ctrl+Z annule le dernier geste de construction, et les lignes reviennent à leur état d'alors (`tests/bugsManuel.test.ts`).
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
