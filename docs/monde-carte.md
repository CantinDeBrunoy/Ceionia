# Le monde : la carte

> Fichiers : `src/world/world.ts` (classe `World` : grille, couches, relief affiché, sauvegarde), `src/world/mapgen.ts` (`newWorld`, décors d'office, pétrole), `src/world/continent.ts` (plan et hauteurs du continent, climat), `src/world/noise.ts` (bruit simplex), `src/world/terraform.ts` (pinceaux, effet sur la grille), `src/render/terrainView.ts` (maillage du sol), `src/world/ferry.ts` (traversée vers l'île).
> Tests : `tests/place.test.ts`, `tests/rivage.test.ts`, `tests/curves.test.ts`, `tests/ferry.test.ts` (tous appellent `setMapSize(192)` puis `syncChunks()` avant `new World()`).
> Voir aussi : [eau-rivieres.md](eau-rivieres.md), [vegetation-biomes.md](vegetation-biomes.md), [outils-terrain.md](outils-terrain.md), [sauvegarde.md](sauvegarde.md), [portail-ile.md](portail-ile.md), [architecture.md](architecture.md)

## En bref
La carte est une grille de `N × N` cases ; le relief est défini sur les `(N+1)²` sommets de cette grille. Chaque case porte des couches parallèles (route, végétation, bâtiment, décor…). Une seule carte est jouable, le « Continent » (`MAPS` dans `mapgen.ts`, 192 cases de côté), tiré d'une graine : relief, climat, forêts, lacs, grottes, pétrole et île du portail en découlent. Le joueur modifie ensuite le relief (sculpture, bâtiments qui aplanissent) ; seul le relief brut est sauvegardé, tout le reste de ce qui est « visuel » se recalcule.

## Règles du jeu
- Taille : `MapDef.size` = 192 pour le Continent (`MAPS`). Id de carte `CONTINENT = 3` (numéro des sauvegardes d'origine ; une carte inconnue retombe sur lui dans `main.ts`).
- Hauteurs : `MIN_H = -2.4`, `MAX_H = 16`, mer à `SEA = 0` (`world.ts`). Les pinceaux et le générateur écrêtent à ces bornes.
- Repères d'altitude (`world.ts`) : `MOUNTAIN_H = 2.4` (on est « dans la montagne » : mine, carrière, club alpin), `TREE_LINE = 5.8` (plus d'arbres posés par le générateur au-dessus), `SNOW_LINE = [7, 8.2]` (neiges éternelles, fondu), `ALPINE_PEAK = 5.2` et `ALPINE_REACH = 7` (station de ski : un sommet d'au moins 5,2 à moins de 7 cases).
- Aucun brouillard de guerre : toute la carte est visible dès le départ. La brume affichée est météo (`fogLevel` dans `main.ts`), voir [ciel-meteo.md](ciel-meteo.md).
- Début de partie : `World.startSpot()` cherche la place 3 × 3 libre la plus proche du centre ; `clearStart` (`mapgen.ts`, version 3) y retire arbres et rochers.

## Fonctionnement dans le code

### Grille et couches (`World`)
Index d'une case : `ci(x, z) = z * N + x` ; d'un sommet : `vi(x, z) = z * (N + 1) + x`. Une case `(cx, cz)` a pour coins les sommets `(cx..cx+1, cz..cz+1)` (`cellCorners`, `cellAvg`, `cellMin`, `cellSlope`).

| Couche | Type | Sens |
|---|---|---|
| `heights` | `Float32Array (N+1)²` | relief de jeu (sauvegardé × 100, arrondi) |
| `occ` | `Int32Array N²` | id du bâtiment qui couvre la case (0 : libre) |
| `road` | `Uint8Array` | 1 : route (courbes : `curves`, voir [routes.md](routes.md)) |
| `veg` | `Uint8Array` | 0 rien, `VEG_FOREST` 1, `VEG_FIELD` 2, `VEG_GARDEN` 3, `VEG_ROCKS` 4, `VEG_CAVE` 5, `VEG_WRECK` 6, `VEG_VOLCANO` 7, `VEG_FISSURE` 8 ; `>= VEG_CAVE` = décor unique |
| `decor` | `Uint8Array` | emprise (déborde de la case) d'une grotte ou d'une faille ; recalculé par `computeDecor` |
| `biome` / `biomePaint` | `Uint8Array` | biome de la case ; peinture du joueur (0 : climat, sinon biome + 1) |
| `lake`, `lakeLevel` | `Uint8Array`, `Float32Array` | lacs, calculés par `Streams` (voir [eau-rivieres.md](eau-rivieres.md)) |
| `waterDist` | `Uint8Array` | distance à l'eau en cases (0 = eau, plafonnée à 12 puis 255) |
| `basalt`, `ash` | `Float32Array`, `Uint8Array` | coulées de lave refroidies (voir [outils-terrain.md](outils-terrain.md)) |
| `oil` | `Uint8Array` | gisements de pétrole |
| `grazed`, `bloom` | `Float32Array` | vie sauvage, non sauvegardée |

Le champ `World.n` vaut `N` à la construction. `N` et `VS` sont des `let` exportés : `setMapSize(n)` les change et doit être appelé **avant** de construire `World`, les vues, la caméra (`main.ts` le fait au démarrage, puis `syncChunks()` de `vegetation.ts`). Valeur par défaut `N = 96` : sans `setMapSize(192)`, un test échoue de façon obscure.

Marqueurs de travail pour la vue : `terrainDirty` / `terrainRect` (`markTerrain`, `markTerrainAll`, `takeTerrainRect`), `vegDirty` / `vegRect` (`markVeg`), `roadsDirty`, `version` (toute modification structurelle ; la simulation et les ponts en dépendent), `visVersion` (relief affiché refait).

### Relief affiché (`vis`)
La vue ne dessine pas `heights` mais `vis`, grille `VS × VS` avec `VR = 2` sous-sommets par case (`VS = N*VR + 1`). `World.updateVis(rect)` :
1. `computeBiomes` puis `computeDecor` ;
2. suréchantillonne `heights` en interpolation bilinéaire ;
3. épingle (`visPin`) les sous-sommets sous les bâtiments : ils restent plats ;
4. `VIS_PASSES = 3` passes de flou binomial 3 × 3 (sauf épinglés) ;
5. le lissage s'estompe en altitude (au-dessus de 3, plein à 6) et au bord des à-pics (écart > 0,35) pour garder crêtes et falaises franches ;
6. `carveRavines` (failles, creusées dans `vis` seulement, `ravine` 0..1) puis `raiseCaveKnolls` (buttes des grottes).
Avec `rect` (en cases), seule la fenêtre retouchée plus deux cases de marge est recalculée (`visWindow`). `hAt` lit `vis` (même découpage en triangles que le maillage) ; `rawAt` lit `heights` (utilisable avant le premier `updateVis`). **La logique de jeu lit surtout `heights` via `cellAvg`/`cellMin`/`cellSlope` ; le rendu, la marche des habitants (`surfaceAt`) et le placement des modèles lisent `hAt`.** Les deux peuvent différer de quelques centièmes.

### Génération (`newWorld` dans `mapgen.ts`)
Versions du générateur (`continent.ts`) : `GEN_FIXED = 1` (agencement fixe, d'avant le plan), `GEN_PLAN = 2` (agencement tiré de la graine), `GEN_VAR = 3` (plan plus libre, huit orientations, lacs et forêts variables). `GEN = GEN_VAR` pour les nouvelles parties ; `newWorld(world, mapId, seed, gen = GEN_PLAN)` : **sans `gen`, c'est la version 2 (continent de référence des tests, qui ne doit plus bouger)** ; `main.ts` passe `GEN` pour une partie neuve.

Étapes de `newWorld` :
1. `genHeights` : bruits `Simplex(seed)` et `Simplex(seed*7+13)` ; chaque sommet prend `plannedHeight(toPlan(orient, x, z))` (version 1 : `fixedHeight`), écrêté à `[MIN_H, MAX_H]`. `world.restore(...)` installe la grille.
2. `computeBiomes`, `shapeBiomes` (mares de marais, dunes de désert, voir [vegetation-biomes.md](vegetation-biomes.md)), `computeBiomes` à nouveau.
3. Forêts et rochers par case (bruit `Simplex(seed+99)`, densité par biome) ; version 3 : `addGroves` (8 à 23 bosquets). Détail dans [vegetation-biomes.md](vegetation-biomes.md).
4. `world.sanitize` (retire la végétation que la pente interdit).
5. Volcan : `raiseVolcano(world, …, 5.5)` au centre de la contrée « île volcanique » du plan (`fromPlan` le remet dans le repère de la carte).
6. Lacs de montagne : `carveTarns` (version 3 : 2 à 7 cuvettes entre les hauteurs 4 et 8,5, puis 0 à 4 étangs entre 1 et 3,2 ; version 2 : 5). Voir [eau-rivieres.md](eau-rivieres.md).
7. `addDefaultDecor` : grottes (2 au plus, espacées de 30), failles (5, espacées de 20), épaves (3, espacées de 14), puis `addOilFields` (`OIL_FIELDS = 7` nappes dont `OIL_DRY = 3` d'abord en désert ou marais, `OIL_SPACING = 26`).
8. `addPortalIsland` (si plan) : île du portail au large (voir [portail-ile.md](portail-ile.md)).
9. Version 3 : `clearStart`.

### Le plan du continent (`continentPlan(seed, gen)`)
Le plan est un jeu de « contrées » `Zone { u, v, r, a, e }` (centre en part de carte, rayon, axe, étirement) : côte (ellipse déformée avec caps et baies), montagnes (chaîne et sommets `peaks`), plateaux en gradins, grand lac et îlot, île volcanique et détroit, mesas, archipel, rivière (`riverU`), vent (oriente les dunes), `orient` (0 à 7 : bit 1 miroir est-ouest, bit 2 miroir nord-sud, bit 4 échange des axes ; `toPlan` / `fromPlan`). Le tirage est refait jusqu'à 100 fois tant que `fits(plan)` est faux (lac fermé, massif dans les terres, archipel au large, rivière qui ne frôle ni lac, ni mesas, ni île) ; sinon `SAFE_PLAN`. Générateurs aléatoires : `mulberry32(seed*991 + 7121)` (version 3) ou `seed*977 + 4049` (version 2).

`plannedHeight` empile, dans l'ordre : relief de fond (`relief` ou `RELIEF0`), montagnes, plateaux, mesas, lac, collines de l'île volcanique, mer autour (`d` côte), rive du lac, détroit, île, archipel, vallée de la rivière, mer sur les bords (4 cases). L'ordre compte : un ajout au milieu change les contrées d'après.

### Cases et emprises
- `canPlace` (voir [placement-construction.md](placement-construction.md)) : refus sur `occ`, `road`, `decor`, `lake`, eau trop proche (`cellMin < 0.05`), pente (`mx - target > 0.85 * s * steep`).
- `place` aplanit l'emprise à `flatTarget` (moyenne, ou hauteur des coins déjà tenus par un voisin) ; `vertexHeld` : un sommet partagé avec un autre bâtiment n'est pas touché. `removeBuilding` ne remet pas le relief d'origine.
- Grottes et failles : `decorCells` (disque `CAVE_R = 1,15` ; faille : sillon sinueux de 7 à 10 cases de long), `decorFits`, `setVeg`.

## Liens avec les autres systèmes
- [outils-terrain.md](outils-terrain.md) : `sculpt`, `raiseVolcano`, `removeVolcano` écrivent `heights` puis appellent `markTerrain` et `sanitize`.
- [eau-rivieres.md](eau-rivieres.md) : lacs, torrents, ponts lisent `vis`, `lake`, `torrents`.
- [vegetation-biomes.md](vegetation-biomes.md) : lit `biome`, `veg`, `grazed`, `bloom`, `vis`.
- [sauvegarde.md](sauvegarde.md) : `toJSON` / `fromJSON` (ci-dessous).
- [portail-ile.md](portail-ile.md) : `portal`, `onPortalIsland`, `ferryRoute` (`ferry.ts` : rive du continent au plus près de l'île, mouillages à l'eau d'avant `DEEP = -0.3`, ligne droite sans terre ; vue seulement).
- La contamination de l'île (`src/world/blight.ts`) n'agit pas sur la grille : fonctions pures de l'état de l'île qui teintent le sol et la végétation ; décrite dans [portail-ile.md](portail-ile.md).

## Pièges et invariants
- **Sauvegarde** : `toJSON` écrit `n`, `gen`, `heights` (×100), routes, `veg` (paires case, type), biomes peints, bâtiments, lave, pétrole, courbes… `fromJSON` refuse (`Sauvegarde incompatible`) si `d.n !== N` ou si la taille de `heights` diffère. Pas de `gen` dans la sauvegarde : version 1. Le climat (donc les biomes) se recalcule depuis `mapId|seed|gen` (`computeBiomes`, clé `climateKey`) : **changer `fillClimate` ou `continentPlan` pour une version existante modifie les biomes des parties en cours**. Pour changer le générateur, créer une version (`GEN_xxx`), garder les anciennes branches telles quelles.
- Le relief arrondi au centième à la sauvegarde : `addOilFields` classe les cases par un rang tiré de la graine (pas par un tirage en suite) pour retrouver les mêmes nappes.
- `addDefaultDecor` est rappelé à chaque chargement (`main.ts`) et n'ajoute un type que si **aucune** case de ce type n'existe : un joueur qui a effacé toutes ses grottes les retrouve au prochain chargement (à vérifier : probable). Même règle pour le pétrole (`oil.includes(1)`).
- Plusieurs définitions de « case d'eau » coexistent, avec des seuils différents (voir le tableau dans [eau-rivieres.md](eau-rivieres.md)) : `isWaterCell` (< 0,08), `nearWater` / `waterNear` (< -0,05), `isWet`, `realWater`. Ne pas les unifier sans relire les appelants.
- Écrire dans `heights` sans `markTerrain` ni `sanitize` laisse routes et végétation invalides et le rendu périmé. Écrire dans `veg`/`road` sans `markVeg` / `vegDirty` / `roadsDirty` : la vue ne se refait pas.
- `updateVis` pilote aussi biomes et décor : un relief changé sans passage par `TerrainView.update` laisse `biome`, `lake` et `decor` anciens.
- Bâtiments : `repairFootprints` (au chargement) réaplanit les emprises devenues non planes et approfondit le bassin du port ; un port garde son quai à `QUAY_MAX = 0,32` au plus.
- Les cartes d'avant (île, vallée, plateaux) n'existent plus ; `mapDef` renvoie `null`.

## Pour modifier
- **Changer la taille** : `MAPS[0].size` ; vérifier `CH` dans `vegetation.ts` (tuiles de 32 au-delà de 128), `MAX_TORRENTS` et `keep` des lacs dans `streams.ts` (proportionnels à `N`), les tests (`setMapSize`). Les anciennes sauvegardes sont refusées (`d.n !== N`).
- **Nouvelle contrée ou nouvelle forme** : nouvelle version `GEN_xxx` dans `continent.ts`, branche dans `continentPlan` / `plannedHeight` / `fillClimate`, la valeur de `GEN`, `genHeights` et `newWorld` (étapes dépendantes de `v3`). Ne pas modifier `GEN_PLAN` (tests).
- **Nouvelle couche par case** : champ dans `World`, `toJSON` / `fromJSON` avec valeur par défaut, `restore` si elle est dans les annulations (`Snapshot`), marqueur de rafraîchissement.
- **Nouveau décor unique** : constante `VEG_xxx` (>= `VEG_CAVE` s'il est « spécial »), `vegFits`, `pick` dans `addDefaultDecor`, rendu dans `VegView.rebuildSpecial`.
