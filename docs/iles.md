# Les îles de l'archipel

> Fichiers : `src/world/archipelago.ts` (place et relief des îles, replat des villages), `src/world/rivalTown.ts` (plan des villes des peuples rivaux), `src/render/townModels.ts` (leurs modèles, par peuple et par âge), `src/render/rivalTowns.ts` (`RivalTowns` : les villes posées sur la carte), `src/main.ts` (création et mise à jour dans `Game`), `src/render/vegetation.ts` (pas d'herbe dans les villes)
> Tests : `tests/archipel.test.ts`, `tests/villesPeuples.test.ts`
> Voir aussi : [monde-carte.md](monde-carte.md), [rendu-modeles.md](rendu-modeles.md), [ages.md](ages.md)

## En bref
Sur une carte de 384 cases (version 4 du générateur), deux îles rivales font face à l'île principale : celle du peuple oriental (sable, palmiers) et celle du peuple asiatique (tempérée, humide). Chacune porte une ville **de décor** : on n'y bâtit pas, rien n'y est simulé. La ville a un **squelette fixe** (édifice religieux au centre, palais sur le point haut, marché entre les deux, port sur la côte la plus proche, remparts) rempli de façon **procédurale** à partir de la graine (rues, maisons, jardins, champs). Elle suit l'âge du village du joueur : elle se densifie et ses modèles changent à chaque âge.

## Règles du jeu
- **Pas de ville sans archipel** : une partie qui n'a pas accepté d'explorer le monde (`archipelagoOn(world)` faux, `expand.ts`) reste sur 192 cases et n'a rien de tout cela.
- **L'âge** : celui du village (`sim.age`). La Préhistoire montre le bourg de l'Antiquité (`lotsAt`, `RivalTowns.setAge` : âge ramené entre 1 et 5).
- **La densité** : une maison a l'âge où elle apparaît (`Lot.from`). Part des maisons par âge : `HOUSE_SHARE` (`rivalTown.ts`) = 24 % à l'Antiquité, 45 % au Médiéval, 66 % à l'Industriel, 85 % au Moderne, toutes au Futuriste. Les premières sont près des rues et du centre ; la ville se remplit ensuite vers les remparts et dans les vides. Les monuments, les remparts, les portes et le port sont là dès l'Antiquité ; les bains (peuple oriental), le grand jardin (peuple asiatique), les ruelles et les petits jardins arrivent au Médiéval ou après.
- **Les styles** (modèles neufs, pas les nôtres recolorés ; deux peuples inventés, sans caricature) :
  - **peuple oriental** : brique crue à l'Antiquité, puis enduit blanc et sable, toits en terrasse, arcs, coupoles turquoise (dorées au Moderne, de verre au Futuriste), mosquée à cour et minarets (un, puis deux, puis quatre), souk couvert de petites coupoles, caravansérail, palais à iwan et jardin en croix, bains à coupoles percées, tours à vent, moucharabiehs (Industriel), immeubles blancs (Moderne), tours rondes et blocs à arcades vitrées (Futuriste) ;
  - **peuple asiatique** : charpente et chaume à l'Antiquité, puis enduit blanc, tuiles grises, vertes ou bleues et toits courbes aux coins relevés, temple à pagode (trois étages, puis cinq) et salle de prière, palais en trois terrasses à double avant-toit, marché à étals puis halle, jardins à étang, pont en arc et pavillon, maisons-boutiques à lanternes (Industriel), immeubles à enseignes lumineuses (Moderne), tours à étages de toits courbes (Futuriste).
- Les fenêtres, lanternes et néons s'allument la nuit (matériau `mats.lit`, comme nos bâtiments).

## Fonctionnement dans le code

### Le plan (`rivalTown.ts`)
`townPlan(world, rivalIsle)` (mis en cache par graine et peuple ; `townPlans(world)` pour les deux) calcule, à partir des **hauteurs brutes** (`cellAvg`, `cellSlope`, `isWaterCell`) et d'un tirage `mulberry32` propre à la graine et au peuple :
1. **la mer la plus proche** : 72 directions depuis le centre du replat (`isles.rivals[i].village`), la plus courte jusqu'à l'eau profonde (hauteur sous -0,35 : une mare ou une lagune derrière un cordon de sable ne compte pas) (`seaAng`, `seaDist`) ;
2. **le palais** : le point le plus haut d'une couronne de 8 à 12 cases, à plus de 80° de la mer, sur un sol pas trop raide ;
3. **les remparts** : 12 sommets autour du centre (rayon de base `WALL_R` = 13,5 cases, ±10 %), élargis pour enfermer le palais, retenus à 4 cases de la mer, lissés ; la mer tombe au milieu d'un côté ;
4. **les portes** : au milieu du côté qui regarde la mer (la porte du port, toujours la première), et de deux autres côtés à un tiers de tour (sauf celle qui buterait sur le palais) ;
5. **le temple** au centre (façade vers la porte du port), sa place ronde ; **le marché** à mi-chemin du palais, poussé de côté s'il touche ; **le port** dans la direction de la mer, 1,5 case avant l'eau profonde (le quai avance dessus, le navire y mouille) ; **la plage** : le rivage (dernière terre avant l'eau profonde) le plus doux à 25-60° du port ;
6. les **monuments du peuple** : caravansérail près d'une porte de terre et bains près de la mosquée (oriental), grand jardin au pied du palais (asiatique) ;
7. les **rues** : de chaque porte à la place, de la place au palais par le marché, de la porte du port au quai ; puis des ruelles qui s'enfoncent dans les quartiers (Médiéval) ;
8. les **jardins** dans les vides, puis les **maisons** sur une grille tremblée (pas de 1,12 case, maisons de 0,9 à 1,35 case), chacune tournée vers la rue la plus proche (ou vers le centre, au quart de tour, loin des rues) ; quelques ateliers au bord ; les âges d'apparition (`from`) selon `HOUSE_SHARE` ;
9. les **champs** hors les murs, sur les terres plates entre les remparts et la côte (pas sur la route du port) ; les **tours** aux sommets des remparts, les **portes** au milieu de leur côté.

Un lot (`Lot`) : sorte (`TownKind`), centre (cases du monde), emprise `w` × `d`, rotation `rot` (la façade, +z du modèle, regarde vers (sin rot, cos rot)), âge `from`, variante `v`.

### Les points nommés (pour la bataille)
`TownPlan.points` : `plage` (au bord de l'eau), `port` (le quai), `remparts` (les 12 sommets, dans l'ordre), `portes` (milieux des portes, la première sur la route du port), `palais`, `temple`, `marche`, en cases du monde. Le plan n'est pas sauvegardé : il se refait à l'identique de la graine et du relief (test `villesPeuples.test.ts`).

### Les modèles (`townModels.ts`)
- `townModel(peuple, sorte, âge, v, w, d)` : géométrie corps + lumières fondue par `mergeLit`, en cache par peuple, sorte, âge, variante (12 pour les maisons, 4 pour les jardins et champs, 3 sinon) et emprise arrondie au cinquième de case. Mêmes conventions que `models.ts` (origine au centre du lot, façade +z, 1 = une case, couleurs de sommets).
- Outils locaux : `frustum` (tronc de pyramide, faîtage si `d1` ≈ 0), `dome` (coupole ou bulbe, par `LatheGeometry`), `arch` (arc en plein cintre), `curvedRoof` / `curvedSpire` (toits courbes : trois pans de plus en plus raides et coins relevés), `palm`, `pine`, `roundTree`, `windowsAround` (immeubles : un bandeau vitré par étage, recoupé par des trumeaux), `parapet`, `merlons`, `lantern`.
- **Peuple oriental** : ses modèles sont dans `src/render/models/oriental.ts` (`orientModel`, appelé en tête de `townModel` ; une sorte qu'il ne connaît pas encore prend l'ancien modèle de `townModels.ts`). Kit propre : `Face` (repère d'une façade : u le long, n vers l'extérieur ; `faces` pour les quatre côtés d'un bloc, `ring` pour un tambour), `archPts` (contour d'arc plein cintre, outrepassé, brisé), `bay` / `win` / `door` (baies peintes : encadrement, creux ou vitrage, grille, appui), `mosaic` / `panel` (faïence en losanges de couleur, deux triangles par carreau), `merlons` (à gradins, arrondis, carrés), `cornice`, `vigas`, `mashrabiya`, `dome` (demi-sphère, bulbe, profil persan, calotte ; côtes de deux couleurs et ceinture de faïence), `finial`, `palm` (palmes en lames pliées), `cypress`, `fountain`, `bed`. Le style de chaque âge (`style`) : enduit, encadrements, coupoles, arcs, jeu de faïence, merlons, néon. Maisons (`oHouse`, quatre familles par âge selon `v`) : `mudHouse` (brique crue, rondins, chambre haute et échelle, auvent de palmes, coupoles en ruche), enduit blanc à porte en arc, faïence, tour à vent (`windTower`), coupole, tonnelle, linge, moucharabieh et volets à l'Industriel, `modernHouse` (boutique, arcades, balcons, claustra, citernes, paraboles), `futureHouse` (bloc à arcades vitrées sous coupole de verre, tour ronde à jardin suspendu, tour à résille de losanges). Souk (`oMarket` : étals `stall`, halle à coupoles percées, tour de l'horloge à l'Industriel) puis bourse (Moderne, Futuriste : arcades, horloge, panneau des cours lumineux, anneau holographique), caravansérail (`oCaravan` : cour à galeries sur un à quatre niveaux, tours d'angle, coupoles des chambres, chameaux `camel`, verrière au Futuriste), bains (`oBaths` : hammam à coupoles percées de jours `bathDome`, chaufferie ; spa à bassin aux âges modernes). Couleurs : le verre et les fenêtres reprennent le bleu-gris du village (une couleur chaude serait prise pour une flamme qui vacille) ; `notWater` grise la calotte des coupoles bleues, que le shader de l'eau prendrait pour de l'eau. Mosquée (`oMosque` ; `mudMosque` à l'Antiquité : contreforts à pinacles, rondins, tours du mur de fond) et palais (`oPalace` : enceinte à tours rondes, porte d'honneur, jardin en croix, iwan à alvéoles, portiques à colonnes `talar`, kiosques du toit ; tours de verre au Futuriste).
- `townWall(peuple, âge, longueur)` : un pan de rempart qui plonge de 1,5 case sous le sol ; `plinthGeo` : le socle d'un lot en pente, une boîte unité étirée par l'instance.
- Budgets (test) : maisons 1 300 triangles au plus, temple et palais 11 000 (lots de 25 et 30 cases, une pièce de chaque par ville ; mosquée 5 900 à 9 800, palais 4 700 à 10 700), autres monuments 6 500, pan de rempart 600. Ce qui coûte : les merlons (pas de moins de 0,28 case sur un long mur, boîtes sans dessous `openBox`), les cylindres (colonnes ouvertes `column`), les palmes.

### La vue (`rivalTowns.ts`)
- `RivalTowns` est créé par `Game` dès que `archipelagoOn(world)` (partie neuve de 384 cases, ou partie rechargée après l'agrandissement de `expandWorld`), mis à jour chaque image (`update(dt, sim.age)`), caché hors de la surface (Enfers, souterrain).
- Un seul lot `GeoBatch` (`mats.lit`) pour les deux villes : un corps par lot, un socle quand le sol penche, les pans de remparts (posés par tronçons de 1,6 case à la hauteur la plus basse, en marches), et le sol des rues et des places (une géométrie drapée par ville, refaite à chaque âge, couleur `streetColor`).
- Hauteur d'un lot (`footing`) : relief affiché (`hAt`) sur neuf points de son emprise ; au-dessus de la plupart de l'emprise, le socle comble le reste. Le port : quai à fleur d'eau, entrepôt sur la rive.
- Changement d'âge (`setAge`) : chaque lot s'écrase puis regonfle dans son nouveau modèle (0,8 s), les départs étalés sur 5 s ; les maisons nouvelles sortent de terre. `setAge(âge, true)` : sans animation (captures, essais).
- Relief sculpté (`world.visVersion` change) : tout se repose.
- Le sol : `markGround` met `world.town` (cases des villes, non sauvegardé) pour que `VegView.meadow` et `loneTreeAt` n'y fassent pousser ni herbe, ni buisson, ni caillou ; les forêts et rocailles de ces cases sont retirées de `veg`.

## Liens avec les autres systèmes
- Le replat des villages (`flattenVillages`, `village.r` = 15) vient du générateur de l'archipel ([monde-carte.md](monde-carte.md)) : tout plat jusqu'à 0,6 fois le rayon, puis 30 % du relief gardé jusqu'au bord, ce qui donne au palais son point haut (il se pose vers 12 cases du centre). Les remparts (rayon moyen d'environ 14,5) tiennent dans le replat ; la côte est à 15-32 cases du centre. Un lot en pente prend un socle. Les ruisseaux qui traversent parfois la ville passent sous les rues et les maisons (pas encore de ponts).
- Les âges ([ages.md](ages.md)) : `sim.age` mène la ville.
- La future bataille lira `townPlans(world)[i].points` (plage, remparts, portes, port, palais).

## Pièges et invariants
- Le plan ne dépend que de la graine et des **hauteurs brutes** : ne pas y lire le relief affiché (`vis`), recalculé plus tard et lissé.
- `World.town` n'est pas sauvegardé et `veg` est retouché à la création de la vue : une ancienne sauvegarde se charge sans rien de nouveau.
- Une couleur `undefined` dans un modèle devient du blanc : prendre les couleurs dans une liste par `pick` (indice en boucle, aussi négatif).
- Toutes les géométries du lot doivent passer par `mergeLit` (mêmes attributs) ; le sol des rues aussi.
- Une pièce animée qui s'écrase disparaît sous 3 % de sa taille (`setPiece`) : sinon son toit aplati ferait une tache au sol.
- Coût mesuré (graine 11, vue de haut à la distance maximale, ordinateur, panneau caché) : environ 790 pièces et 170 000 à 195 000 triangles pour les deux villes, de 1 à 4 ms de rendu sur 35 ms.

## Pour modifier
- **Changer un modèle** : la fonction du peuple dans `townModels.ts` (`oHouse`, `oTemple`, `aTemple`, `pagoda`…), branche de l'âge ; lancer `npx vitest run tests/villesPeuples.test.ts` (budgets, emprise).
- **Ajouter une sorte de lot** : `TownKind` et, pour un monument, `SIZE` (`rivalTown.ts`) ; sa place dans `drawTown` ; son `case` dans `townModel` ; s'il n'a pas de socle, l'exclure dans `RivalTowns.place`.
- **Changer la densité** : `HOUSE_SHARE`, le pas de la grille et la taille des maisons dans `drawTown`.
- **Essayer** : en développement, `?n=384&seed=11` lance une partie de 384 cases ; `__game.sim.age = 3` change l'âge (la ville suit), `__game.rivalTowns.plans` donne les plans et leurs points.
