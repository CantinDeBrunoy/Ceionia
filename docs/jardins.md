# Jardins, parcs et places

> Fichiers : `src/world/gardens.ts` (zones, plan par âge, places des habitants), `src/render/gardens.ts` (`GardenView` : décor 3D, animations), `src/build/tools.ts` (outil Jardin, voir `applyVeg`), `src/world/world.ts` (`VEG_GARDEN`, `vegFits`), `src/sim/agents.ts` (`refreshGardens`, `gspots`), `src/sim/sim.ts` (bien-être des cases)
> Tests : `tests/jardins.test.ts`
> Voir aussi : [vegetation-biomes.md](vegetation-biomes.md), [outils-terrain.md](outils-terrain.md), [habitants.md](habitants.md), [besoins-population.md](besoins-population.md), [batiments-catalogue.md](batiments-catalogue.md), [routes.md](routes.md)

## En bref
Un jardin n'est pas un bâtiment : c'est une zone de cases peintes à l'outil Jardin (`veg = VEG_GARDEN`). Chaque zone d'un seul tenant devient un lieu dont le plan et le décor changent avec l'âge et dépendent de sa taille et de sa forme. Le plan (`layoutGarden`) est un calcul pur et déterministe, partagé par le dessin (`GardenView`) et par les habitants, qui prennent place sur les emplacements du plan (bancs, aires de jeu, postes de travail). Les « places » pavées des rues et la place du village (`gather`) sont autre chose (voir plus bas).

## Règles du jeu
- **Peindre** : outil Jardin (touche 8, vignette « Décor » en tête du groupe « Parcs et décor » du rayon Vie et culture). Pinceau de rayon `max(0,6, rayon × 0,8)`. Une case n'est peinte ni sur un bâtiment ni sur une route, ni dans l'eau (lac, torrent, ruisseau, rive mouillée). Terrain : `vegFits` exige une hauteur moyenne d'au moins 0,2 et une pente d'au plus 0,6 à la pose (0,9 pour qu'elle tienne après sculpture, `sanitize`).
- **Bien-être** : chaque case de jardin ajoute 0,8 de bien-être (`Sim.recalc` : `Jy += gardens × 0,8`), quel que soit l'âge ou le plan.
- **Un jardin = une composante connexe** (4-voisinage) de cases `VEG_GARDEN` (`findGardens`).
- **Plan par âge** (`layoutGarden`, `size` = nombre de cases) :
  - **0, Préhistoire** (`camp`) : `clamp(round(size/10), 1, 5)` feux entourés de rondins ; dès 2 cases, des ateliers autour (boucherie, silex, séchoir, peaux, bûcher, poteries…, `min(36, round(size × 0,8))`) ; peaux étendues dès 4 cases ; mât totem dès 6 ; tente dès 8 ; menhir dès 10 ; baies, os, fougères, enfants.
  - **1, Antiquité** (`antique`) : bassin de marbre dès 4 cases (cherché à quatre tailles décroissantes), statue sur le bassin dès 9, colonnades dès 10 cases et 3 de large ; sans bassin, une statue au centre et une allée ronde ; cyprès, oliviers, bancs de marbre, amphores, carrés d'herbes, autel dès 6, pergola dès 8, roses.
  - **2, Médiéval** : `tourney` (lices de joute, gradins, chevaliers à cheval qui chargent) si l'axe long fait au moins 4,5, la largeur au moins 2, au moins 7 cases et si `half ≥ 1,1` ; sinon `lices` : quintaine, cibles, pavillon dès 3 cases, balles de foin, bannières, râtelier d'armes dès 4.
  - **3, Industriel** : jardin **à la française** (`french`) si au moins 6 cases, `fill ≥ 0,85` (zone presque rectangulaire) et largeur ≥ 2,5 : fontaine centrale, topiaires, parterres, réverbères à gaz ; sinon **à l'anglaise** (`lawn(c, false)`) : allée sinueuse lissée, bancs, saule, kiosque dès 10, fontaine dès 14, fabrique dès 18.
  - **4, Moderne** (`park`) : aire de jeux au milieu (toboggan toujours ; ressort dès 2 ; balançoires dès 3 ; bascule dès 4 ; bac à sable dès 5 ; tourniquet dès 7 ; portique dès 9 ; doublons dès 12 et 16), sol souple, puis `lawn(c, true)` (allées, bancs, poubelles, lampadaires, arches).
  - **5, Futuriste** (`future`) : serre-dôme de verre dès 6 cases, sinon arbre-lumière ; allées lumineuses, bassin anti-gravité dès 10, trampoline lumineux dès 4, gyroscope dès 9, massifs hexagonaux soignés par des drones, jardinières flottantes dès 8.
- **Habitants** : ils s'assoient, travaillent, flânent, jouent ou courent sur les `Spot` du plan (`Act` : `sit`, `work`, `cheer`, `play`, `run`, `stroll` ; `kid` pour les enfants).
- **Saisons et nuit** : le feuillage caduc se resserre et se teinte, les fleurs disparaissent l'hiver (`leaf ≤ 0,5` ou neige `≥ 0,3`), l'eau gèle (neige `> 0,55`) ; les feux éclairent la nuit et fument avec les cheminées.

## Fonctionnement dans le code
- **Zone** (`Garden`) : `cells`, `set`, centre, axe long (`angle`, moments d'inertie, ramené à la grille si la zone remplit 70 % de son rectangle ou si l'écart est de moins de 0,15 rad), `len`, `wid`, `fill`. `id` = plus petite case.
- **Plan** (`Layout`) : `style`, `items` (sorte, position, cap, échelle, variante), `spots`, `paths` (dalles d'allée), `lanes` (couloirs de joute). Le tirage est semé par `mulberry32(g.id × 31 + âge × 7919 + 1)` : même zone, même âge, même jardin.
- **`Ctx`** : points candidats (centre et quatre quarts de chaque case, mélangés), `fits`/`find`/`center` cherchent une emprise libre dans la zone (hors route et bâtiment), `put` pose un élément et réserve son rayon, `block` réserve sans rien poser, `spot` ajoute une place d'habitant.
- **Rendu** (`GardenView.sync(age)`) : pour chaque jardin, une signature `âge|nombre de cases|hachage des cases (route, bâtiment)|somme des hauteurs` ; si elle change, le jardin est refait (`build`), sinon rien. Un changement d'âge refait tout et fait « pousser » les jardins (`pop`, 0,6 s). Les éléments sont fusionnés par canal (corps, lumière, feuillage caduc, persistant, fleurs, eau, verre) : quelques maillages par jardin. Les pièces animées (balançoires, bascules, tourniquets, jets d'eau, drones) et les chevaliers sont des objets à part ; les flammes sont instanciées (`MAX_FLAMES = 128`).
- **Appels** (`main.ts`) : `gardens.sync(age)` au démarrage, puis dans la boucle quand `w.vegDirty`, `roadsDirty` ou `propsDirty` (qui est levé au passage d'âge) ; `gardens.update(dt, hour)` à chaque image ; `applySeason`, `lights`, `chimneys` pour la saison, les halos de nuit et la fumée.
- **Habitants** (`agents.ts`) : `refreshGardens(age)` recalcule tous les plans (`layoutGarden(...).spots`) quand `w.version`, l'âge ou le mode moteur changent, et libère les places tenues.
- **Terrain** : `terrain.gardenAge` teinte le sol sous les jardins selon l'âge.
- **Éléments connus du rendu** : `GARDEN_PIECES` (clés de `B`) ; chaque `Item.k` produit par un plan doit y figurer (testé).

## Liens avec les autres systèmes
- Bien-être : [besoins-population.md](besoins-population.md) (0,8 par case, `land.gardens`).
- Habitants : [habitants.md](habitants.md) (places de jardin, `gspots`).
- Routes : les routes libres et automatiques évitent les jardins (coût +4 et +6, [routes.md](routes.md)) ; un jardin peint sur une route est refusé.
- Terrain et nature : [outils-terrain.md](outils-terrain.md), [vegetation-biomes.md](vegetation-biomes.md) (la lave et la sculpture peuvent effacer un jardin ; `World.coverLava` épargne les jardins sans catastrophes).
- Rendu : [rendu-modeles.md](rendu-modeles.md), [ciel-meteo.md](ciel-meteo.md) (saisons).
- Les ruchers butinent « les champs et jardins voisins » : voir [faune.md](faune.md).

**Places** : la **place du village** est le bâtiment `gather` (3 × 3, sans porte, première pose obligatoire) : voir [batiments-catalogue.md](batiments-catalogue.md). Les **places pavées** sont un effet de rendu des routes (quatre cases de route en carré, poches d'herbe enclavées, cours devant ateliers et temples) : voir [routes.md](routes.md). Aucune des deux n'utilise le plan de jardin.

## Pièges et invariants
- **Toute retouche d'une zone refait son plan en entier** : le tirage dépend de la liste de ses cases (candidats mélangés, `id`). Agrandir un jardin d'une case déplace tous les éléments ; ce n'est pas un bug.
- Un élément ajouté au plan doit être dessiné : ajouter sa clé à `B` (`render/gardens.ts`) sous peine d'élément invisible ; le test « le rendu sait dessiner chaque élément de chaque âge » vérifie `GARDEN_PIECES`.
- **Budget** : moins de 1 200 triangles par case et peu de maillages à chaque âge (test) ; un jardin de 100 cases à l'âge 5 reste lourd, donc chaque nouvelle pièce se fait en géométrie basse (`Parts`).
- Les plans ne doivent pas lire de données non déterministes (`Math.random`, temps) : le dessin et les habitants doivent tomber sur les mêmes emplacements.
- Les `Spot` doivent être dans la zone (`inside`) ; `c.spot` filtre déjà, ne pas pousser directement dans `out.spots`.
- Allée et route : un jardin ne crée pas de route ; si une route traverse la zone (peinte avant), ses cases sont exclues par `inG` (`!w.road && !w.occ`).
- Un jardin coupé en deux par une route (ou un bâtiment) donne deux zones et deux plans à la prochaine sync.
- Commits à connaître : « Jardins : banc-cocon et allée de la serre corrigés » (jardin futuriste), « Jardins par âge, routes et bâtiments façon diorama » (création).

## Pour modifier
- **Ajouter un élément de décor** : le placer dans la fonction de son âge (`camp`, `antique`, `medieval`, `french`, `lawn`, `park`, `future`) avec `c.put(sorte, x, z, cap, échelle, rayon)` ; écrire son constructeur dans `B` (`render/gardens.ts`, canal `p`, `leaf`, `ever`, `fl`, `water`, `glass` ou `dyn` pour une pièce animée) ; lancer `tests/jardins.test.ts`.
- **Changer les seuils de taille** : les constantes sont écrites dans chaque fonction (`size >= …`) ; pas de table centrale.
- **Ajouter un nouvel âge** : `layoutGarden` (enchaînement `if/else` sur l'âge) et `tcol` (couleur des dalles, `build`).
