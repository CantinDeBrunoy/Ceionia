# Routes

> Fichiers : `src/build/freeRoad.ts` (route libre, A*), `src/build/autoroads.ts` (chemins d'accès automatiques), `src/build/tools.ts` (outil Route, mode ligne), `src/world/world.ts` (`canRoad`, `setRoad`, `addCurve`, `curveCells`), `src/world/curves.ts` (courbes, rastérisation), `src/world/crossings.ts` (ponts), `src/render/roads.ts` (`RoadView`, tout le dessin), `src/sim/agents.ts` (`sidewalkAt`), `src/render/traffic.ts` (voie des véhicules)
> Tests : `tests/autoroads.test.ts`, `tests/curves.test.ts`, `tests/franchissements.test.ts`, `tests/trottoirs.test.ts`, `tests/neigeRoutes.test.ts`, `tests/rivage.test.ts`
> Voir aussi : [placement-construction.md](placement-construction.md), [eau-rivieres.md](eau-rivieres.md), [habitants.md](habitants.md), [trafic.md](trafic.md), [chemin-de-fer.md](chemin-de-fer.md), [remparts.md](remparts.md)

## En bref
Une route est une case de `World.road` (0 ou 1). Le joueur en trace de deux façons (ligne case par case, ou courbe de A à B) ; le jeu en trace seul entre un bâtiment neuf et le réseau. Les routes ne coûtent rien. Habitants, charrettes et secours ne circulent que sur ces cases. Le dessin (`RoadView`) regarde les cases voisines et les courbes pour produire chaussée, trottoirs, places, ronds-points, ponts et lanternes, avec un revêtement qui change avec l'âge.

## Règles du jeu
**Poser une case** (`World.canRoad`) : pas sur un bâtiment ni sur une grotte ou une faille ; sur l'eau, un pont est permis sur un lac et sur la mer jusqu'à `cellAvg > -1,7` (pas au large) ; sur terre, pente de la case `cellSlope < 1,3`. Une route efface la végétation de la case (`setRoad`).

**Route en ligne** (mode « Ligne ») : on glisse, une case posée par case traversée (Bresenham, 200 cases au plus par événement, `applyRoad`). Chaque case refusée est sautée en silence.

**Route libre** (mode « Libre », mode par défaut, `roadMode = 'free'`) : un clic au point A, un clic au point B, ou un glissé de A à B (relâcher à plus de 12 px de l'appui). Un ruban vert (rouge si refusé) montre la courbe prévue, avec une flèche au bout. Un clic sur A, ou Échap, oublie A. Une fois la route posée, l'outil est quitté (`setTool('none')`). R, l'outil étant déjà en main, bascule entre les deux modes (`main.ts`).
- Longueur : `FREE_MAX = 80` cases à vol d'oiseau (« Trop loin »).
- Refus avec message (`RoadPlan.why`) : « Hors de la carte. », « On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde. » (A ou B non posable), « Pas de passage : des bâtiments, l'eau profonde ou des pentes trop raides barrent le chemin. ».
- Le chemin contourne bâtiments, pentes et champs ; il ne franchit l'eau que si l'on ne peut pas faire autrement.
- Un clic de départ sur une route existante est permis ; la nouvelle route la croise ou la rejoint.

**Routes automatiques** (réglage `autoRoads`, vrai par défaut, dans les réglages ; `Game.setAutoRoads`) : à la pose d'un bâtiment, `autoRoad` trace un seul chemin de sa porte jusqu'au réseau (ou, sans réseau encore, jusqu'à la porte du bâtiment le plus proche : le tout premier bâtiment n'a rien à relier).
- Rien si la porte donne déjà sur une route, rien pour `lamp`, `gather`, `wall`, `gate` (`hasDoor`).
- Longueur maxi : `MAX_LINK = 14` cases ; `MAX_SHORE = 30` pour le ponton et le port (accès par l'arrière, jamais sur l'eau) ; `MAX_JOIN = 18` pour relier un hameau.
- **Hameau** : un réseau qui dessert exactement `HAMLET = 3` bâtiments est relié une fois au réseau voisin le plus proche (`joinHamlet`).
- Un bâtiment orienté de lui-même ouvre sa porte du côté commode et tourne sa façade vers le chemin ; orienté à la main, il garde sa façade.
- Le chemin va droit (`TURN = 0,6` par virage), longe les façades, évite les champs (+6), pente (×1,5), forêt et rochers (+0,8), eau (`WET = 8`, nouveau franchissement `CROSS = 14`), et les terrains libres où tiendrait un grand bâtiment (`OPEN3 = 1,6`, `OPEN2 = 0,6`, `spoiled`). Il ne longe jamais une route existante, ne la rejoint qu'en un point, ne fait pas de carré de route (`square`, `TWICE = 4`), ne longe pas le flanc ni l'arrière d'un bâtiment (`FLANK = 3`, détour accepté jusqu'à `DETOUR = 7`) sauf s'il n'y a pas d'autre tracé (niveaux 0 à 3 de `wisest`).

**Démolir une route** : outil Démolir, une case ou un disque ; voir [placement-construction.md](placement-construction.md). Le relief qui rend une case impraticable après sculpture la retire (`World.sanitize`).

**Ponts** : il n'y a pas d'outil pont. Une route posée sur de l'eau devient un pont à l'affichage et pour la simulation. `crossings.ts` détecte les franchissements une seule fois (cases mouillées, plus les une ou deux cases sèches prises entre deux bras, `MAX_DRY_GAP = 4`) et fixe le profil du tablier (`DECK_CLEAR = 0,24` au-dessus de l'eau). Détail : [eau-rivieres.md](eau-rivieres.md).

**Trottoirs et voies** : les piétons ne marchent sur le trottoir (`SIDEWALK = 0,37` de l'axe) qu'à partir de l'âge 3 (`sidewalkAt`) et pas sur un pont ; les véhicules roulent à droite, à `LANE = 0,15` de l'axe (`render/traffic.ts`).

## Fonctionnement dans le code
**Route libre** (`planRoad(w, ax, az, bx, bz)`) :
1. cases de A et B en centres ; A* en 8-voisinage dans la boîte de A et B élargie de `MARGIN = 14` ;
2. coût d'une case (`cost`) : `1 + pente × 2,5`, forêt +1,5, rochers +1, champ +4, eau +8 (hors pont existant), route existante +1,5 (on croise, on ne longe pas), voisin d'un bâtiment +0,6 ; infini si `!canRoad` ;
3. coûts de passage : saut de hauteur supérieur à `STEP_H = 0,75` refusé hors de l'eau, diagonale refusée entre deux obstacles, ou en rognant le coin d'une case d'eau, nouveau franchissement +12 ;
4. tirage en lignes droites (jusqu'à 12 cases, `fits(…, cheap = true)`) puis adoucissement de Chaikin à 3, 2, 1 puis 0 passes : la courbe la plus douce qui reste praticable, qui ne frôle aucun bâtiment (`BAND = 0,22`) et qui ne mouille pas plus de cases que le chemin cherché.
5. Résultat : `{ pts, cells, why }`. `World.addCurve(pts)` arrondit les points au centième, pose les cases (`rasterize` + `setRoad`) et enregistre la courbe dans `World.curves` (`{ id, pts }`).

**Courbes** (`curves.ts`) : `sampleCurve` (pas de `CURVE_STEP = 0,1`), `rasterize` (cases voisines par un côté ; en diagonale, ajoute la case la plus proche de la ligne), `chaikin`. Pour la simulation, une courbe n'est qu'une suite de cases ordinaires ; seule la vue la dessine courbe. `World.curveCells()` met en cache les cases de toutes les courbes (même celles dont la route a été démolie) ; `curveAt(k)` ne répond que si la case est encore une route.

**Sauvegarde** : `toJSON` n'écrit que les courbes qui ont encore au moins une case de route, points ×100 ; `fromJSON` les relit. `snapshot`/`restore` (annuler) les gardent aussi.

**Dessin** (`RoadView`, `render/roads.ts`) :
- `build(age, snow)` est un générateur : `rebuildSoon` l'avance par pas de budget (8 ms, doublé à chaque relance sans aboutir, 60 ms au plus, `step`) ; les anciens chemins restent affichés jusqu'à ce que les nouveaux soient prêts. `rebuild` fait tout d'un coup (chargement, tests).
- Déclencheurs (`main.ts`, boucle) : `w.roadsDirty`, `propsDirty`, changement des torrents (`streams.version !== roads.builtStreams`), palier de neige (`roadSnowStep`) ; au plus toutes les 0,12 s (`propsTimer`).
- Revêtement par âge (indices 0 à 4, `min(âge, 4)`) : `ROAD_COL` sentier, chemin de terre, dalles, pavés, asphalte ; largeur `HW`. Âges 0 à 2 : chemins de terre qui serpentent (`WIGGLE`, `warp`), bords effilochés, cailloux, ornières, cours en terre battue devant certains bâtiments (`YARD`). Dès l'âge 3 (`town`) : rues droites (`streets`), trottoirs le long des cases de ville (`town` : cases à moins de 2 cases d'un bâtiment, hors lampadaire et ponton), passages piétons, lignes médianes.
- **Cas spéciaux détectés d'après les cases** : quatre cases de route en carré = place pavée ; un carré ou rectangle plein de cases de route (grand côté ≤ 2 × petit) = rond-point (îlot planté, cédez-le-passage ; `islands` sert aux voitures) ; case sous une porte de rempart (`gated`) : la rue y passe droit dans l'axe ; cases de pont (`bridged`) : bords pris au milieu exact.
- **Courbes** : `findCurved` coupe chaque courbe case par case et ajoute des raccords vers les voisines de route qui ne sont pas sur la même courbe ; `curveSdf` donne la chaussée et les trottoirs ; la chaussée déborde sur les cases voisines non routées (`spill`).
- **Lumières** : `lightCells` choisit une lanterne environ une case sur deux (carrefours d'abord, puis abords de porte, virages) ; torches à la Préhistoire. `roads.lights` alimente les halos de nuit.
- **Ponts** : tablier, garde-corps, piles, treillis (industriel, moderne) ou pylône et haubans (futur) selon l'âge (`DECK_COL`, `PILE_COL`).
- **Neige** : le shader de chaussée reçoit `uSnow` ; les tabliers sont repeints (`paintDeck`) sans refaire la géométrie.

## Liens avec les autres systèmes
- Habitants, charrettes, véhicules, secours : ne marchent que sur `w.road` ([habitants.md](habitants.md), [trafic.md](trafic.md)).
- Placement : `canPlace` refuse une case de route (sauf lampadaire et porte de rempart), la case devant une porte est réservée au chemin ([placement-construction.md](placement-construction.md)).
- Remparts : un pan saute les routes ; la porte les enjambe ([remparts.md](remparts.md)).
- Chemin de fer : voies séparées de `World.road` ([chemin-de-fer.md](chemin-de-fer.md)).
- Eau : ponts, torrents sous la route ([eau-rivieres.md](eau-rivieres.md)).

## Pièges et invariants
- Les courbes survivent à la démolition de leurs cases (`curveCells` garde tout). Si le joueur démolit une route libre puis repose une case de route à la main au même endroit, la vue la dessine comme un morceau de l'ancienne courbe (`curveAt` répond de nouveau). À vérifier à l'écran ; la sauvegarde élimine les courbes mortes.
- `planRoad` et la pose peuvent diverger : le plan est fait sur l'état du monde au moment de l'aperçu (clé `w.version|w.visVersion`), la pose recalcule (`freeLay` rappelle `planRoad`). Ne pas poser le résultat d'un aperçu ancien.
- `autoRoad` est exécuté par `tryPlace`, pas par `World.place` : un bâtiment posé par un test ou par un déplacement logique n'a pas de chemin.
- Un déplacement refait un chemin d'accès sans effacer l'ancien : des routes inutiles s'accumulent (comportement actuel).
- Dessiner les chemins d'un grand village coûte 100 à 200 ms : toujours `rebuildSoon`, jamais `rebuild`, en jeu. Commits : « Chemins refaits au fil des images » ; la neige est dans le shader (« Neige des routes par le shader »).
- Cases de pont : les habitants et véhicules suivent le tablier dessiné (`World.surfaceAt`, `bridgeY`) ; la détection est unique (`crossings.ts`). Ne pas la dupliquer dans le rendu (commit « Ponts : un seul profil de tablier pour le dessin et la simulation »).
- Les chemins automatiques n'osent pas le flanc d'un bâtiment : en changeant `doorSide` ou `doorSpan`, relancer `tests/autoroads.test.ts` (villages de test, peu de routes, chaque bâtiment relié par sa porte).
- La place du village n'a pas de porte : `nearDoor` l'aborde de toutes ses cases de bord ; ne pas lui ajouter de porte sans revoir `flank`.

## Pour modifier
- **Changer l'allure du chemin automatique** : constantes en tête de `autoroads.ts` ; vérifier `tests/autoroads.test.ts`.
- **Changer la route libre** : `cost`, `STEP_H`, `BAND`, nombre de passes de Chaikin dans `freeRoad.ts` ; le ruban d'aperçu est dans `ToolController.freePreview`.
- **Nouveau revêtement par âge** : tableaux de couleurs en tête de `roads.ts` (un élément par âge de 0 à 4) et `uStyle` dans le shader.
- **Nouveau décor de rue** : dans `build()` de `roads.ts`, un pas du générateur (les pas gardent chacun quelques ms).
