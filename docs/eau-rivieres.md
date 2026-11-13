# Eau, rivières, lacs, torrents et ponts

> Fichiers : `src/world/world.ts` (`isWet`, `realWater`, `nearWater`, `canRoad`, `canPlace`, `setLakes`, `setTorrents`, `surfaceAt`), `src/render/streams.ts` (lacs et torrents, classe `Streams`), `src/render/terrainView.ts` (plan d'eau de la mer, courant, écume), `src/world/crossings.ts` (franchissements et tablier des ponts), `src/world/mapgen.ts` (`carveTarns`, `shapeBiomes`), `src/world/continent.ts` (vallée de la rivière), `src/world/ferry.ts`, `src/world/terraform.ts` (effet des pinceaux).
> Tests : `tests/franchissements.test.ts`, `tests/litDeCailloux.test.ts`, `tests/rivage.test.ts`, `tests/pontons.test.ts`, `tests/ferry.test.ts`, `tests/sources.test.ts`.
> Voir aussi : [monde-carte.md](monde-carte.md), [outils-terrain.md](outils-terrain.md), [routes.md](routes.md), [chemin-de-fer.md](chemin-de-fer.md), [placement-construction.md](placement-construction.md), [trafic.md](trafic.md), [vegetation-biomes.md](vegetation-biomes.md)

## En bref
Il n'y a **pas de réseau de rivières** dans les données : la mer est un plan d'eau plat au niveau `SEA = 0` qui couvre toute la carte, et toute case dont le sol est sous ce niveau est de l'eau. Une rivière n'est qu'une vallée creusée par le générateur sous le niveau de la mer. Seuls deux objets d'eau sont calculés à partir du relief affiché : les **lacs** de montagne (creux remplis, niveau propre) et les **torrents** (rubans qui descendent les pentes). Quand le joueur sculpte, l'eau « se redirige » parce que tout se déduit du relief ; ce qui est recalculé, et quand, est décrit plus bas.

## Règles du jeu
- Niveau de la mer : `SEA = 0` (`world.ts`). Le sol est du sable franc jusqu'à 0,12 de hauteur, qui s'estompe jusqu'à 0,42 (`terrainView.ts`, `beach`) ; au marais, vase au lieu de sable.
- Creuser sous 0 donne de l'eau **à ce niveau-là, même loin de la mer** (une mare) ; remonter le sol au-dessus de 0 l'assèche. Une cuvette creusée entre 0 et 2,5 sans passer sous 0 reste sèche.
- Un creux assez haut, grand et profond devient un lac : niveau (`level`) au moins 2,5, profondeur (`deep`) au moins 0,35, au moins 16 sous-sommets (environ 4 cases), moins de 4 % d'arbres, ni bâtiment, ni champ au fond. Au plus `round(N/8)` lacs (24 sur 192), les plus grands et profonds d'abord.
- Torrents : au plus `round(N/16)` sources de montagne (12) plus un torrent par déversoir de lac ; sources espacées de plus de 9 cases, au-dessus de `max(2.4, 0.5 × sommet)`.
- Hiver : la glace suit `iceNow` (gel de la saison, nul sous 0,35 de neige, lissé). Mer et rivières gèlent depuis les rives et les eaux dormantes, en plaques irrégulières ; le courant fort reste libre, et rien ne gèle là où la neige ne tient pas (tropiques, désert, via `SNOW_U`). Les lacs gèlent depuis les rives et gardent des trous d'eau libre au plus profond ; les torrents se figent sur le plat, les chutes raides coulent encore (embruns réduits).
- Le reste de l'année, teinte, limpidité, reflets et vitesse du courant suivent la saison ; pétales ou feuilles dérivent au fil des rivières ([saisons.md](saisons.md)).
- Pont : toute route sur de l'eau « réelle » ou sur un torrent est portée par un pont, un seul tablier continu de rive à rive. Pas de route au large (voir ci-dessous).
- Interdit dans l'eau, selon l'objet : voir le tableau « Seuils » et la section « Ce qui est interdit ».

## Fonctionnement dans le code

### La mer et les rivières (rendu : `TerrainView`)
- Plan d'eau : `PlaneGeometry` à `SEA`, une maille par case, de la carte et de la mer de décor autour ; la couleur et l'écume viennent de la profondeur lue dans `heightTex` (le relief affiché en texture) ; houle dans le vertex shader.
- **Mer de décor** autour de la carte (affichage seul) : `seaMargin()` cases de chaque côté (`world.ts`, `round(N / 12) × 2` : 32 sur la grande carte de 192, 16 sur celle de 96). La grille, les règles et les sauvegardes ne la connaissent pas : on n'y bâtit pas, la caméra ne la vise pas (bornes de `clampGoal` inchangées), la mini-carte ne la montre pas. Le plateau entier déborde d'autant : plan d'eau, parois d'eau (`makeWaterSides`), falaise (`updateSkirt`, partie du fond du large `SEA_DEEP`), socle rocheux (`makeRock`). Le fond (`TerrainView.margin`, `updateMargin`) part des sous-sommets du bord de la carte (sans couture), rejoint en `SEA_SLOPE = 6` cases la pleine mer du générateur (`SEA_FLOOR = -1`) puis s'enfonce jusqu'à `SEA_DEEP = -1,3` au bout (`marginFloor`) ; il prend le matériau du relief, teinte et sol du bord qui se fondent dans la moyenne du fond de mer le long des bords. Dans le shader de l'eau, hors de la carte (`off` : distance au carré de la carte), la profondeur suit la même pente depuis la texture prolongée ; courant et eau dormante du bord s'éteignent en 4 cases. La brume s'étend aussi à la marge (`uMistBox`, `atmosphere.ts`). Coût : un plan d'eau de 256² mailles au lieu de 192², et environ 55 000 sommets de fond refaits seulement quand le bord de la carte change.
- Rivière générée : dans `plannedHeight` (`continent.ts`), `riverU(r, v)` donne l'abscisse de la rivière de sa source à son embouchure ; autour, une vallée gaussienne (sigma 7) fait descendre le sol vers une pente, et un chenal étroit (sigma 2,1) est creusé à -0,9. Source dans le flanc du massif (`river.u`, `river.v`). Rien n'est retenu du relief après la génération.
- **Lit de cailloux** (version 3 du générateur) : sur l'amont, de la source jusqu'à `plan.bed.end` du cours (tiré entre 0,3 et 0,4, bord irrégulier, effacé sur 0,08 : `rockyBed`), le chenal est plus large (sigma 2,1 → 2,8) et peu profond (fond vers -0,22 ± 0,07 au lieu de -0,9). L'eau reste de l'eau pour toutes les règles (bâtir, routes, ponts) ; le shader l'éclaircit en haut-fond et y forme la glace en hiver. `fillRiverBed` en tire un masque par case (`World.bed`, 0 … 255, à moins de 4 cases de l'axe, non sauvegardé, refait avec le climat dans `computeBiomes`). Le décor (`VegView.riverbed`, voir [vegetation-biomes.md](vegetation-biomes.md)) y pose de gros rochers, des dalles et des cailloux là où le fond est entre -0,6 et 0,4 : une ancienne partie, au chenal profond, n'en montre pas ; une case comblée ou bâtie les perd ; aucun sous un pont. À la génération, `rockyBanks` (`mapgen.ts`) change environ une case de rive sur trois en rocaille, et `shapeBiomes` n'aplanit pas le lit quand il traverse un marais.
- Courant : `TerrainView.computeFlow` fabrique une texture `flowTex` (une case par texel ; rg direction, b force, a = 1 sur l'eau) : pour chaque case d'eau (`cellAvg < -0.05`, hors lac) à 4 cases au plus d'une rive. L'**axe** suit le bord de l'eau : part de terre en carré de rayon 2, son gradient, puis tenseur de structure de ce gradient en carré de rayon 3 ; le vecteur propre mineur suit le chenal, même en son milieu. Le **sens** va vers les berges plus basses (moyenne des berges en carré de rayon `R = 4`) 4 cases plus loin le long de l'axe. La force `narrow × strong` (b) est maximale dans les chenaux étroits. Purement visuel. Recalculé dans `update` si le relief change et que de l'eau est à moins de 6 cases de la zone (`waterNear`), jamais pour une simple retouche de teinte.
- Dessin du courant (shader de l'eau) : tirets fins qui filent vers l'aval, pétales ou feuilles qui dérivent. Le motif est tracé dans le repère de chaque maille d'une grille de 3 cases, tourné autour du centre de la maille avec la direction lue en ce centre ; les quatre mailles voisines se fondent. La direction filtrée se lit `2 rg - a` (hors de l'eau la texture vaut 0).
- Fonds : le sol sous l'eau se teinte de sable mouillé vers `SEABED` ; vase au marais. Algues, coraux, roseaux, nénuphars : voir [vegetation-biomes.md](vegetation-biomes.md).

### Lacs et torrents (`Streams`, `streams.ts`)
`Streams.update` surveille `world.visVersion`. Quand le relief affiché change :
1. Le travail en cours est abandonné (`job = null`) ; le décompte `wait` (0,8 s) tourne tant que le relief change. Premier calcul (`built < 0`) : d'un coup (`rebuild`).
2. Une fois le décompte épuisé, `steps()` (générateur) tourne par petits bouts de 4 ms par image. **Pendant une sculpture continue, le calcul est sans cesse annulé et ne se termine qu'après l'arrêt du pinceau (au plus ~0,8 s après la dernière modification).** Entre-temps, les anciens lacs et torrents restent affichés et `world.lake` est périmé.
3. Étapes de `steps()` :
   - **Relief rempli** (`filled`) : remplissage par file de priorité (`MinHeap`, algorithme « priority flood ») depuis les bords de la carte, les sous-sommets sous `SEA + 0.02`, ceux dont `ravine > 0.02` (fond de faille) et un disque de 5 cases autour de chaque volcan (cratères sans eau). Chaque creux est monté jusqu'à son point de débordement.
   - **Lacs** : groupes de sous-sommets où `filled - vis >= 0.03`, filtrés (conditions de la section « Règles »). Déversoir (`outlet`) : `flatPath` cherche en largeur, sur le replat du lac, le premier sommet d'où l'on redescend. Nappe : `buildLakes` (un carré par sous-case dont un coin est noyé, à `level + 0.015`, teinte `LAKE_SHALLOW` vers `LAKE_DEEP` selon la profondeur).
   - **Annonce au monde** : `world.setLakes(cells, level)` ne retient que le sous-sommet central de chaque case (`x % VR === 1 && z % VR === 1`) ; si l'ensemble change, `markVeg` sur la zone, `vegDirty`, `version++`. C'est `lake[k]` et `lakeLevel[k]` que lisent construction, routes, faune, pêche.
   - **Torrents** : sources = déversoirs des lacs puis sommets les plus hauts (pas de 2 sous-sommets, tri par hauteur + hasard stable `hash2(…, 31)`), espacés de plus de 9 cases. `trace` descend la plus grande pente du relief rempli (8 voisins) ; sur un replat, `flatPath` le traverse ; il s'arrête à la mer, dans un autre lac, dans un ravin (`ravine > 0.3`), ou **juste avant une case de bâtiment** (le dernier point est retiré). Rejet si moins de 10 points, ou perdu dans un creux sans eau en moins de 24 points. Lissage de Chaikin (2 passes), rééchantillonnage tous les 0,25 case.
   - **Ruban** (`ribbon`) : 3 sommets de large, drapé sur `hAt`, largeur `0.1 + 0.16 × min(1, distance/22)`. Une chute (pente > 1,1) laisse des embruns (`Spray`) à son pied.
   - **Cases traversées** : `streamCells` (`covers(k)`, utilisé par `tools.ts` pour refuser champs et forêts) et, pour le monde, `crossed` = cases dont le ruban passe à 0,45 au plus du centre ; `world.setTorrents(crossed)` augmente `torrentVersion` si l'ensemble change.
4. `streams.version` change à chaque recalcul : `main.ts` met alors `roadsDirty` pour refaire les chemins et leurs ponts.

### Redirection des cours d'eau quand on sculpte (récapitulatif)
| Ce que fait le joueur | Ce qui se passe |
|---|---|
| Creuse sous 0 (`dig`, `lower`) | L'eau apparaît aussitôt (plan d'eau + profondeur du shader). Les routes qui passent là perdent leur sol (`sanitize` : `canRoad` faux au large) sauf sur un pont possible (avg > -1,7). Biomes et `waterDist` refaits (`computeBiomes`). |
| Remonte un barrage dans une rivière (`raise`, `flatten`) | La rivière disparaît là où le sol passe au-dessus de 0 ; il n'y a **pas** de montée d'eau en amont (niveau global). Un pont dont la case n'est plus mouillée devient route ordinaire (`crossings` recalculé via `version`). |
| Creuse une cuvette en altitude | Après l'arrêt du pinceau (0,8 s), le creux se remplit en lac si les seuils sont atteints ; le torrent voisin se retrace, un torrent sort du lac par son déversoir. |
| Aplanit ou monte une pente | Les torrents sont retracés selon la nouvelle plus grande pente ; un torrent peut se couper, changer de vallée ou disparaître (trop court). |
| Fait un volcan, une faille | Ni lac ni torrent dans le cratère ni au fond d'une faille ; le torrent s'arrête au bord d'un ravin. |
| Pose un bâtiment sur un lac | Impossible (`canPlace`, `lake`) ; un bâtiment posé au fond d'un creux empêche le lac (`blocked`) à la prochaine passe. |

La sculpture elle-même (pinceaux, rayon, valeurs) : [outils-terrain.md](outils-terrain.md). Ce qui est vu ici : `sculpt` refuse de toucher aux sommets d'une case bâtie ou d'une route (`locked`) : on ne peut donc pas creuser sous un pont ni sous une route, et un pinceau qui touche un bâtiment ne change rien du tout.

### Seuils : qu'est-ce qu'« eau » ?
Plusieurs définitions coexistent (`world.ts`) ; chacune sert un usage.

| Fonction | Test | Usage |
|---|---|---|
| `isWaterCell` | `cellAvg < 0.08` | distance à l'eau (`waterDist`) et biomes |
| `nearWater(r = 3)` | `cellAvg < -0.05` ou lac | feux (pompiers : `fires.ts`) |
| `waterNear(x, z, s, reach)` | `cellAvg < -0.05` ou lac | bâtiments de la mer (`SEA_REACH = 5`) |
| `isWet` | lac, `cellAvg < 0.08`, ou un coin à `<= -0.15` | routes : un pont est nécessaire ; autoroutes (surcoût `WET = 8`, `CROSS = 14` dans `autoroads.ts`) |
| `realWater` | lac, `cellAvg < 0.02`, ou un coin à `<= -0.2` | détection des ponts (ni flaque, ni rive qui trempe à peine) |
| `isWater` (`crossings.ts`) | `realWater` ou case de torrent | cases à franchir |
| `canRoad` | sur l'eau : lac ou `cellAvg > -1.7` ; à sec : pente `< 1.3` | pose et maintien des routes |
| `seaAt(x, z, depth)` | `hAt < depth` et hors ravin | eau libre en un point (faune marine, bateaux) |

### Ponts et franchissements (`crossings.ts`)
Une seule détection et un seul profil de tablier servent à la fois au dessin (`render/roads.ts`) et à la simulation (`World.surfaceAt`, `bridgeY`, `passPoint` : habitants et véhicules marchent sur le tablier dessiné).
- `carriedCells` : cases de route sur de l'eau, plus les cases sèches prises entre deux cases d'eau le long de la même route (`MAX_DRY_GAP = 4` au plus, sauf si le sol dépasse le tablier de plus de 0,5).
- `carriedGroups` : groupes voisins ; `findCrossings` découpe chaque groupe en tronçons (`Span`) d'une rive à l'autre. Une case de route à 3 voisins ou plus est un **nœud** (plateau carré). L'axe passe par les milieux des bords entre cases (une route en escalier donne une diagonale) : simplification de Douglas-Peucker (tolérance 0,55), arrondi de Chaikin, pas de `STEP = 0,2`.
- Profil en long (`deckProfile`) : corde entre les deux bouts, au-dessus de l'eau + `DECK_CLEAR = 0,24` (débord `OVERHANG = 0,12` de chaque côté de l'eau) et du sol + `ABOVE_GROUND = 0,03` ; enveloppe convexe supérieure : jamais de marche ni de creux. Rampe d'accès de `RAMP_IN = 0,45` sur la case de la rive (`World.surfaceAt` y donne la hauteur du tablier).
- Torrent : sans niveau d'eau propre, son « eau » est le sol + `TORRENT_WATER = 0,05` ; le tablier passe à `DECK_CLEAR` au-dessus.
- `World.crossings()` met le résultat en cache, invalidé par `version`, `visVersion` et `torrentVersion`. Sans changement de l'un des trois, pas de recalcul.
- Les voies ferrées utilisent les mêmes ponts et enjambent un torrent sur un ponceau (`railView.streams`).
- Traversée en galère vers l'île du portail (`ferry.ts`) : tracé droit sur l'eau, sans route ni pont, vue seulement.

### Ce qui est interdit dans l'eau
(`World.canPlace` et outils)
- Bâtiment ordinaire : refus si un coin de la case est à moins de 0,05 (« Trop proche de l'eau ») ou si le sol nivelé est à moins de 0,05 ; refus sur un lac.
- Ponton (`pier`) : il lui faut une case voisine d'eau (`cellAvg < -0.05` ou lac) et peut s'avancer dans l'eau peu profonde (moyenne ≥ 0,05 requise sur ses propres cases).
- Port (`harbor`) : pas en eau profonde (`cellAvg < -0.9`), un côté du quai doit toucher l'eau, un pied sur la rive, quai à moins de 0,6 au-dessus de l'eau (lac ou mer) ; il creuse son bassin sur trois rangs (`dredge`) et son quai est remblayé à `QUAY_MAX = 0,32` au plus.
- Bâtiments de la mer (`SEASIDE` : chantier naval, phare, halle aux poissons, ferme marine) : de l'eau à 5 cases au plus de l'emprise.
- Champs, forêts, rochers peints : refusés sur un lac, sur un torrent (`wetCell`), ou si un coin de la case est sous 0,05 (`tools.ts`). La végétation déjà posée est retirée si l'eau monte (`sanitize`, `vegFits`).
- Grottes et failles : terre ferme seulement (`avg >= 0.3`) ; épave : seulement en eau peu profonde (`-1 <= avg <= 0.3`) ; volcan : `avg >= 0`.
- Routes : voir `canRoad` ; au large (moyenne ≤ -1,7), aucune route.

## Liens avec les autres systèmes
- [routes.md](routes.md) : tracé automatique et libre évitent l'eau (coûts), ponts posés par la détection.
- [chemin-de-fer.md](chemin-de-fer.md) : ponceaux, ponts ferroviaires.
- [trafic.md](trafic.md), [faune.md](faune.md) : bateaux, pêche et animaux lisent `seaAt`, `lake`, `waterDist`.
- [vegetation-biomes.md](vegetation-biomes.md) : lacs gelés, algues et nénuphars selon la distance au rivage, marais.
- [outils-terrain.md](outils-terrain.md) : pinceaux, volcans, failles.
- [ciel-meteo.md](ciel-meteo.md) : saisons et neige qui gèlent l'eau.

## Pièges et invariants
- Mer de décor : un nouvel effet de l'eau lu dans une texture par case (`uFlow`, `uHeight`…) doit s'éteindre hors de la carte (`off > 0`), sinon il s'y coupe net au bord. Ce qui va « jusqu'au bord de la carte » (navires, montgolfières) s'arrête au bord de la grille, avant la fin du plateau.
- **Temps de réaction** : lacs et torrents suivent la sculpture avec un retard (~0,8 s après la dernière modification) ; une fonction qui lit `w.lake` juste après un coup de pinceau lit l'ancien état.
- `lake` est connu sur le sous-sommet central de la case seulement ; un lac « fin » (moins d'une case de large) ne marque aucune case.
- Le niveau de la mer est **global** : aucune simulation d'écoulement, de crue ni de barrage. Un lac a son propre niveau (`lakeLevel`) ; le tablier d'un pont de lac est à `lakeLevel + DECK_CLEAR`.
- `World.deckY` (niveau de l'eau + 0,32, sert à `trackEdit.ts`) n'est pas le profil des ponts (`crossings.ts`, `DECK_CLEAR = 0,24`) : à ne pas confondre (à vérifier si l'écart est voulu).
- Les ponts dépendent de `torrents` : un torrent déplacé par une sculpture peut créer ou retirer un pont sous une route existante au tour suivant (c'est voulu, d'où le `roadsDirty` de `main.ts`).
- **Courant** : ne jamais tourner le motif autour de l'origine du monde (`dot(vWater, dir)`) : à 100 cases de l'origine, un centième de radian d'écart de direction décale le motif de plusieurs tirets, d'où des franges serrées en courbes de niveau, chevrons et spirales. Et la pente moyenne des berges seule va d'une rive à l'autre (une rive plus haute) : elle ne donne que le sens, pas l'axe.
- `carriedCells` boucle sur toutes les cases de route : ne pas l'appeler à chaque image, passer par `World.crossings()` (cache).
- La détection d'une case de torrent exige que le ruban passe près du centre (0,45) : une route qui frôle le torrent n'a pas de pont.
- Les routes ont des seuils d'eau plus généreux (`isWet`) que les ponts (`realWater`) : une case mouillée à peine laisse la route au sol.
- Un torrent s'arrête devant un bâtiment (point retiré) : bâtir près d'un torrent peut le raccourcir à la passe suivante.

## Pour modifier
- **Changer la taille ou le nombre de lacs / torrents** : `keep` et `MAX_TORRENTS` dans `streams.ts` (proportionnels à `N`), seuils dans `steps()` (`level < 2.5`, `deep < 0.35`, `cells.length < 16`).
- **Le lit de cailloux** : étendue dans `continentPlan` (`bed.end`) et `rockyBed`, profondeur et largeur dans `plannedHeight`, décor dans `VegView.riverbed`, rives dans `rockyBanks`. Le masque dépend seulement de la graine et de `gen` : le changer change le décor des parties en cours, pas leur relief (sauvegardé).
- **Lacs et étangs de génération** : `carveTarns` dans `mapgen.ts` (arguments `want`, `lo`, `hi`, `k`), puis le remplissage les révèle ; ne pas supposer qu'une cuvette creusée devient forcément un lac.
- **Une nouvelle règle « pas dans l'eau »** : ajouter le test dans `canPlace` (`world.ts`) avec le seuil adapté (voir le tableau), et dans le pinceau concerné s'il y en a un.
- **Un nouveau type de franchissement** : `isWater` et `carriedCells` (`crossings.ts`) ; le dessin est dans `render/roads.ts` ; vérifier `tests/franchissements.test.ts`.
- **Changer la hauteur d'un tablier** : `DECK_CLEAR`, `OVERHANG`, `ABOVE_GROUND` (`crossings.ts`) ; tout le reste (dessin, marche, véhicules) suit, car le profil est unique.
