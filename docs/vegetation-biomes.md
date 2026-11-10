# Végétation, climat et biomes

> Fichiers : `src/world/world.ts` (`computeBiomes`, `paintBiome`, `vegFits`, `setVeg`, `sanitize`, constantes `BIOME_*`, `TREE_LINE`, `SNOW_LINE`), `src/world/continent.ts` (`fillClimate`), `src/world/mapgen.ts` (forêts, rochers, bosquets, `shapeBiomes`), `src/render/vegetation.ts` (`VegView` : arbres, herbe, fleurs, rochers, fonds marins), `src/render/treeShapes.ts` (formes procédurales de secours), `src/render/season.ts` et `seasonConfig.ts` (saisons, voir [saisons.md](saisons.md)), `src/render/terrainView.ts` (teinte du sol par biome et par saison), `src/render/alpine.ts` (station de ski).
> Tests : `tests/rivage.test.ts` (algues, roseaux, nénuphars), `tests/saisons.test.ts`, `tests/champs.test.ts`, `tests/neigeRoutes.test.ts`.
> Voir aussi : [monde-carte.md](monde-carte.md), [eau-rivieres.md](eau-rivieres.md), [ciel-meteo.md](ciel-meteo.md), [faune.md](faune.md), [jardins.md](jardins.md), [outils-terrain.md](outils-terrain.md), [rendu-modeles.md](rendu-modeles.md)

## En bref
Chaque case a un **biome** (tempéré, taïga, désert, tropical, marais) déduit d'un climat de fond tiré de la graine, de l'altitude et de la proximité de l'eau. Le biome choisit les essences d'arbres, la couleur du sol, les fleurs, la faune. La végétation « gameplay » (forêt, champ, jardin, rocaille) est une valeur par case (`world.veg`) ; tout le décor fin (herbe, fleurs, buissons, cailloux, sous-bois) est **dessiné** par `VegView` à partir de hachages de la case, sans être stocké. Les saisons changent couleurs, feuillage, neige et hauteur des cultures.

## Règles du jeu
- Biomes (`world.ts`) : `BIOME_TEMPERATE = 0`, `BIOME_TAIGA = 1`, `BIOME_DESERT = 2`, `BIOME_TROPICAL = 3`, `BIOME_MARSH = 4` ; noms dans `BIOME_NAMES`. L'ordre sert d'indice dans de nombreux tableaux (couleurs, fleurs, neige…).
- Le joueur peut **peindre** un biome (pinceau de biome, `World.paintBiome` / `biomesChanged`) : la peinture l'emporte sur le climat, même quand le relief change ; null rend la case à son climat.
- Forêts, champs, jardins, rochers se posent au pinceau (`tools.ts`) sous les conditions de `World.vegFits` (voir plus bas) ; ni dans l'eau, ni sur un bâtiment ou une route.
- Hauteur des arbres : plus d'arbres posés par le générateur au-dessus de `TREE_LINE = 5.8`. Neiges éternelles entre `SNOW_LINE = [7, 8.2]`. Les sapins remplacent les feuillus au-dessus de ~4,2 d'altitude (voir ci-dessous).
- Saison : le printemps fleurit (cerisiers roses et blancs en bosquets), l'été est vert soutenu, l'automne orange, jaune et rouge, l'hiver neigeux et nu ; la neige ne tient que la première moitié de l'hiver (détail dans [saisons.md](saisons.md)). Les cultures sont rases l'hiver (`growth` 0,05) : champs vides sous 0,12.
- Désert et tropiques ne voient presque pas la neige (facteurs de neige par biome).

## Fonctionnement dans le code

### Climat et biomes
- `fillClimate(gen, seed, n, temp, wet)` (`continent.ts`) remplit deux tableaux par case : température et humidité de fond. Température : `v*1.5 + max(0,u)*1.1 - 0.05` (froid au nord, chaud au sud et à l'est) plus un bruit `Simplex(seed*13+5)` ; humidité : bruit `Simplex(seed*17+9)`. Avec un plan (version ≥ 2), le désert se resserre autour des mesas, les tropiques autour de l'archipel, les rives du grand lac s'humidifient (marais), pas son îlot ; le tout suit le plan tourné (`toPlan`). Version 1 : aucun plan, agencement fixe.
- `World.computeBiomes(rect)` : recalcule `temp`/`wet` si la clé `mapId|seed|gen` a changé (donc au chargement), puis les distances à l'eau (`waterDist`, parcours en largeur depuis les cases `isWaterCell`, plafonné à 12), puis le biome de chaque case :
  - `t = temp − max(0, h − 2.6) × 0.22` (l'altitude refroidit), `m = wet + (0.25 si d ≤ 2, 0.1 si d ≤ 5)` ;
  - `t < -0.36` : taïga ; sinon `t > 0.3` : désert si `m < 0.08`, sinon tropical ; sinon `m > 0.32` et `h < 1.4` et `d ≤ 4` : marais ; sinon tempéré ;
  - `biomePaint` l'emporte.
  Avec `rect`, seule la zone retouchée est refaite, sauf si une case y a changé d'état eau/terre (alors tout est recalculé). Appelé par `updateVis`.
- `shapeBiomes` (`mapgen.ts`, à la génération seulement) sculpte le relief selon le biome : marais (sommets sous 1,2 : mares de bruit `Simplex(seed+313)`, fond jusqu'à -0,8, sinon aplati vers 0,3), désert (au-dessus de 0,4 : dunes `sin` d'amplitude ~0,45, orientées par le vent du plan).

### Génération des arbres et rochers (`newWorld`, `mapgen.ts`)
Par case de terre (`cellAvg ≥ 0.12`), bruit `Simplex(seed+99)` :
- Rocaille (`VEG_ROCKS`) : sommets (> 4,3, 30 % si bruit positif), pentes raides (0,8 à 1 : 35 % au désert, 20 % en taïga, 12 % ailleurs), quelques plages (< 0,45, sauf tropiques).
- Au-dessus de `TREE_LINE` : alpages, éboulis, neige, pas d'arbres. Sous 0,45 : pas d'arbres sauf tropiques et marais.
- Forêt (`VEG_FOREST`) : seuil de bruit par biome `dense = [0.12, 0, 0.42, 0.04, 0.1]` (taïga et tropiques denses, désert clairsemé), décalé de ±0,13 par partie et fréquence 0,1 à 0,2 en version 3 (`vary = mulberry32(seed+6)`), 80 % de remplissage (35 % au désert) ; lisière : 4 % juste sous le seuil. `addGroves` (version 3) : 8 à 23 bosquets de rayon 1 à 2,8.
- `sanitize` retire ensuite ce que la pente interdit.

### Conditions de pose (`World.vegFits(type, avg, slope, placing)`)
`placing = true` : pose du joueur, strict ; `false` : maintien après sculpture, plus tolérant.
- Forêt : `avg ≥ 0.2` (0,1 en maintien), pente ≤ 1,4 (1,8) ; champ et jardin : mêmes hauteurs, pente ≤ 0,6 (0,9) ; rocaille : `avg ≥ 0.12` (0,08), pente ≤ 1 (1,4).
- Grotte : `avg ≥ 0.3`, pente ≤ 2,2 (3) ; faille : `avg ≥ 0.3`, pente ≤ 0,9 (1,3) ; épave : `-1 ≤ avg ≤ 0.3` ; volcan : `avg ≥ 0`.
- `sanitize(x0, z0, x1, z1)` (appelé par chaque pinceau) retire la végétation devenue impossible et les routes que `canRoad` refuse ; **`TREE_LINE` n'est pas vérifié** : le joueur peut planter au-dessus.

### Rendu des tuiles (`VegView`, `vegetation.ts`)
- Découpage : tuiles de `CH × CH` cases (`CH = 16`, 32 si `N > 128`, via `syncChunks()` à appeler après `setMapSize`) ; une `Layer` (maillage instancié) par essence, par tuile. `world.vegRect` + `vegDirty` demandent un recalcul de la zone ; `VegView.rebuild` met les tuiles touchées en tête de file (`enqueue`), `flush` en construit au plus `BUDGET_MS = 5` ms par image (une grande tuile se fait en plusieurs images, ligne par ligne, l'ancien décor reste visible jusqu'à la fin).
- `buildChunk` : par case, `meadow` si `veg = 0`, `forest`, `field`, `rockery` ; `VEG_GARDEN` est dessiné par `GardenView` ([jardins.md](jardins.md)) ; les cases d'emprise de grotte ou de faille (`decor`) restent vides.
- Hasard : `hash2(cx, cz, sel)` (hachage de la case et d'un sélecteur) ; **tout le décor est déterministe**, rien n'est stocké. Ne pas changer un sélecteur sans vouloir déplacer ce décor partout.
- Forêt (`forest`) : 1 à 2 arbres par case (1 à 3 sans modèles importés), mise à l'échelle réduite vers la lisière (`edge`). Essence selon le biome : tropical → palmiers, désert → cactus (12 % d'arbres morts), marais → saules (jusqu'à 72 %), taïga → sapins (92 %), ailleurs sapins 32 % (38 % sans variantes) et feuillus ; au-dessus de 4,2 d'altitude : sapins, souvent enneigés (`snowPines`). Les arbres voisins d'un bâtiment sont réduits ou supprimés (`fit`, `room`, `WALL_GAP = 0,16`) : plus aucun arbre ne traverse un mur.
- Feuillus (`broadleaf`) : feuillage réduit en automne (échelle `max(0.25, leaf)`), remplacé par un bouleau nu quand `leaf < 0.5` ; 40 % fleurissent.
- Sous-bois (`forestFloor`) : souches, troncs couchés, fougères (denses en tropique, absentes au marais), champignons (plus nombreux en automne), buissons ; rien au désert ni sous une neige > 0,6.
- Prairie (`meadow`) : touffes d'herbe (1 à 3 par case de base selon le biome, moins là où `grazed` est élevé), fleurs (probabilité par biome `[0.2, 0.08, 0, 0.32, 0.15]` + `bloom`), arbres isolés, buissons, fougères, champignons, cailloux (`meadowDetails`). Rien sur les neiges éternelles, ni sous 0,32 d'altitude, pente > 1,3, champ de lave nu (`basalt > 0.45`) ni près d'un volcan (5 cases). Désert : cactus nains, broussailles, ossements, grès. Marais : roseaux, nénuphars (seulement près d'une rive).
- Fonds marins (`seabed`) : algues (profondeur 0,3 à 2,2, près du rivage), coraux (0,15 à 1,1, pas en marais ni taïga, 40 % en tropique, 22 % ailleurs). Pas d'algues ni de coraux sous une neige > 0,9.
- Champs (`field`) : blé en sillons (`WHEAT_DIV = 4` par case), tourné par parcelle (`angleOf`), hauteur `growth`, bord organique (`cover`).
- Île du portail contaminée : `blighted(cx, cz)` remplace forêts et prairies par arbres morts, herbe brûlée, obsidienne ([portail-ile.md](portail-ile.md)) ; fleurs vives dans les halos des défenses.
- Décors uniques (grottes, failles, épaves, volcans, fumée, lave) : `rebuildSpecial`, refaits seulement si la zone modifiée en touche un (`specialNear`).

### Niveaux de détail et performances
- `lodDist` (`LOD_DIST = 48` par défaut ; `high` 48, `medium` 40, `low` 32 dans `adaptive.ts`) : au-delà, une tuile d'arbres passe à une version simplifiée à 28 % des triangles (`makeLods`, `SimplifyModifier`, en tâche de fond ; les couches `lod: true`). Les modèles très détaillés sont d'abord allégés à `max` triangles.
- `DETAIL_DIST = 70` : menus détails (fleurs, touffes…) masqués ; `SMALL_DIST = 110` : petits décors masqués ; `SHADOW_DIST = 70` : plus d'ombre portée au-delà. Tout est multiplié par `lodDist / 48` en qualité réduite.
- De près, l'ombre d'un arbre vient de sa version simplifiée (calque `SHADOW_LAYER`).
- Sans modèles importés (échec de chargement), `treeShapes.ts` fournit des feuillus à boules, des sapins à étages (`pineShape`, trois variantes), des buissons et des rochers procéduraux.

### Saisons sur le décor
- Fiches, palettes et transitions : [saisons.md](saisons.md). Feuillus, buissons, touffes et sapins prennent leur teinte d'une palette de saison par instance (`addPalette`) ; les arbres à fleurs sont tirés par bosquets (`blossomAt`, `SPECIES`) ; chaque feuillu a son propre feuillage (`s.leaf` ± `trees.leafSpread`) : bouleau nu sous 0,5.
- `Game.refreshSeason` (`main.ts`) : clé `floor(seasonT × 120)` ; à chaque nouveau pas, `veg.applySeason` (palettes branchées sur l'état ; si l'un des 10 réglages de forme a bougé de plus de 0,03, **toutes** les tuiles sont remises en file), jardins, neige des toits (`setSnowMap` avec les facteurs `SNOWY`), neige des routes. Le sol : `terrain.recolor` par bandes de `RECOLOR_ROWS = 6` lignes (`stepRecolor`), au plus tous les `2 × max(1, vitesse)` pas.
- Berges (`VegView.bank`) : roseaux à fleur d'eau (pas au milieu d'une rivière, pas sur une case défrichée), touffes en haut de la grève, quelques fleurs ; ni au désert, ni au marais (il a les siens), ni sur l'île contaminée.
- Facteur de neige par biome : `SNOWY = [1, 1, 0.15, 0.2, 1]` (sol et toits, `terrainView.ts`) et `snowy(b)` (`vegetation.ts` : taïga 1,2, désert 0,15, tropical 0,2, autres 1). Les deux tables ne sont pas identiques (taïga) : à garder en tête.
- Lacs gelés et torrents figés : voir [eau-rivieres.md](eau-rivieres.md).
- Station de ski (`alpine.ts`) : les skieurs chaussent des skis si la neige dépasse 0,35 ou si le sommet du site est au-dessus de `SNOW_LINE[0]` ; la pose exige un sommet d'au moins `ALPINE_PEAK` à `ALPINE_REACH` cases (`World.bigPeakNear`).

## Liens avec les autres systèmes
- [monde-carte.md](monde-carte.md) : `veg`, `biome`, génération.
- [faune.md](faune.md) : espèces par biome ; `grazed` et `bloom` modifient l'herbe et les fleurs ; la faune se pose sur `perches` et butine `flowers`.
- [jardins.md](jardins.md) : jardins dessinés à part ; [placement-construction.md](placement-construction.md) : les bâtiments effacent la végétation sous eux (`place`).
- [ciel-meteo.md](ciel-meteo.md) : pluie, neige, aurore ; [outils-terrain.md](outils-terrain.md) : le pinceau de biome et les pinceaux de nature (forêt, champ, rochers).
- [economie-ressources.md](economie-ressources.md) : les forêts nourrissent les bûcherons (`vegAround`), les rochers les carrières.

## Pièges et invariants
- Un nouveau biome change la taille des tableaux par biome (`NB = 5` dans `terrainView.ts`, `SNOWY`, `FERN_TINT`, `TUFT_TINT`, `SHRUB_COLORS`, `WILD_HUES`, `CAVE_ROCK`, `CAVE_TOP`, `dense` de `newWorld`, `lone` de `meadowDetails`, fleurs…) : tous dans le même ordre.
- La peinture de biome (`biomePaint`) est sauvegardée (`toJSON` : `biomes`) ; le climat, lui, n'est pas sauvegardé et se recalcule depuis `gen` : changer `fillClimate` d'une version existante change les biomes des parties en cours.
- Toute modification de `veg`, `road` ou du relief doit marquer la zone (`markVeg`) ; sans cela, l'ancien décor reste.
- Un recalcul de saison remet toute la carte en file : sur 192 cases, c'est volontairement étalé (`BUDGET_MS`). Ne pas appeler `rebuild` de toute la carte à chaque image.
- Les arbres sont dessinés sans collision avec les bâtiments : toute nouvelle couche d'arbres ou de rochers doit passer par `fit` / `room`.
- Un bâtiment démoli ne replante pas : l'herbe revient (`veg = 0`), pas la forêt.
- La lave brûle toujours les arbres ; champs, jardins et bâtiments ne sont détruits que si `world.disasters` est vrai (`coverLava`).
- Les tests de végétation doivent appeler `setMapSize(192)` puis `syncChunks()`.

## Pour modifier
- **Une essence d'arbre** : modèle dans `render/assets.ts` (`bakeStatic`, `species`), couche dans le constructeur de `VegView`, choix dans `forest` / `meadowDetails` (biome, probabilité, altitude).
- **Densité ou taille des forêts** : tableau `dense` et `fq` dans `newWorld` (génération), `cnt` dans `VegView.forest` (rendu).
- **Un nouveau biome** : `BIOME_*` et `BIOME_NAMES` (`world.ts`), règle dans `computeBiomes`, climat (`fillClimate`) si besoin, couleur de sol dans `terrainView.ts`, puis chaque tableau cité ci-dessus.
- **Une saison différente** : sa fiche dans `seasonConfig.ts` ([saisons.md](saisons.md)) ; vérifier `tests/saisons.test.ts`.
- **Changer les distances de détail** : `LOD_DIST`, `DETAIL_DIST`, `SMALL_DIST`, `SHADOW_DIST` (`vegetation.ts`) et `vegLod` (`adaptive.ts`).
