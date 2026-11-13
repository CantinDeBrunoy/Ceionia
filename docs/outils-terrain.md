# Outils de terrain : relief, nature, volcans

> Fichiers : `src/build/tools.ts` (classe `ToolController` : pinceaux, gomme, démolir, historique), `src/world/terraform.ts`
> (`sculpt`, `raiseVolcano`, `removeVolcano`, `CLIFF_STEP`), `src/world/world.ts` (`setVeg`, `vegFits`, `erase`, `sanitize`,
> failles `rift`, `volcanoFrame`, `lavaPool`, `coverLava`, `updateVis`, `carveRavines`), `src/world/mapgen.ts`
> (`addDefaultDecor`), `src/render/vegetation.ts` (décor sauvage, `loneTreeAt`, lac de lave, ravins),
> `src/render/eruption.ts` (classe `Eruptions`), `src/render/terrainView.ts` (teintes du cône, des champs de lave, des
> ravins), `src/ui/ui.ts` (`TOOL_INFO`, `TOOL_DESC`, onglets Relief et Nature), `src/main.ts` (`wakeVolcano`, `erupt`,
> boucle).
> Tests : `tests/outilsTerrain.test.ts`, `tests/volcanRase.test.ts`, `tests/rendu.test.ts` (forme du volcan),
> `tests/world.test.ts` (pinceau sur un bâtiment, failles sans mer), `tests/faune.test.ts` (tanières).
> Voir aussi : [eau-rivieres.md](eau-rivieres.md) (lacs, torrents et rivières qui se redirigent quand on sculpte),
> [monde-carte.md](monde-carte.md), [vegetation-biomes.md](vegetation-biomes.md),
> [placement-construction.md](placement-construction.md), [sauvegarde.md](sauvegarde.md), [expeditions.md](expeditions.md),
> [monde-souterrain.md](monde-souterrain.md).

## En bref
Le mode **Paysage** de la barre du bas, en deux sous-menus. **Relief** : monter, baisser, aplanir, falaise, eau, montagne, volcan. **Nature** : forêt,
biome, rochers, grotte, faille, gomme (le champ se prend dans Bâtir › Production › Nourriture, ou touche 7). Chaque
outil est un pinceau rond (taille `[` et `]`, gardée par outil), sauf la grotte et le volcan, posés d'un clic. Le relief de
jeu est une grille de sommets (`heights`, une case = 1) ; le relief affiché (`vis`) en est un suréchantillonnage lissé. Tout
est annulable (Ctrl+Z, 60 coups).

## Règles du jeu

### Relief (`sculpt`, appelé à chaque image tant que le bouton est enfoncé, pas de temps borné à 0,05 s)
| Outil | Effet | Valeurs |
|---|---|---|
| Monter / Baisser | ± sous le pinceau, fondu vers le bord (`smoothstep`) | 2,4 par seconde au centre |
| Aplanir | vers la hauteur du premier clic (`ctx.target`) | `8 × dt` par image |
| Falaise | tout le disque passe d'un coup sur un gradin, sans fondu | gradins de `CLIFF_STEP = 2` comptés depuis le clic ; au moins un au-dessus (Maj : au-dessous) |
| Eau | creuse vers -1,3 (sous la mer : une mare) | `5 × dt` |
| Montagne | pic pointu, crêtes bruitées | 4,2 par seconde au centre |
| Volcan | un clic : cône, cratère, lac de lave | voir « Volcans » |

- Bornes : `MIN_H = -2.4`, `MAX_H = 16`.
- Un pinceau qui touche un bâtiment ne change **rien** (cercle rouge, message) : `brushOnBuilding`. Les sommets qui bordent
  une route ne bougent pas (le village reste desservi).
- Falaise : sur le plat, un passage dresse un gradin de 2 à paroi franche ; sur une pente, chaque sommet va au gradin le plus
  proche (au moins le premier), d'où des marches nettes ; repasser ne change plus rien. Avant (jusqu'en novembre 2026),
  l'outil arrondissait au mètre près : rien sur le plat, une marche de 1 que le lissage du relief affiché effaçait presque.

### Nature
- Forêt, champ, rochers : pinceau (une application toutes les 0,15 s ; la forêt ne prend que 70 % des cases à chaque
  passage). Jamais dans l'eau, sur un torrent (`wetCell`), une rive mouillée, un bâtiment ou une route. Pentes et hauteurs :
  `vegFits` (forêt : pente ≤ 1,4 et pas au-dessus de `TREE_LINE = 5.8` ; champ : pente ≤ 0,6 ; rochers : pente ≤ 1).
- Une plantation ne recouvre jamais un décor unique (grotte, épave, cratère de volcan) : `setVeg` refuse.
- Biome : peint `biomePaint` (tempéré, taïga, désert, tropical, marais, ou « Climat » pour rendre la case à son climat).
- Grotte : un clic, sur la terre ferme (hauteur ≥ 0,3, pente ≤ 2,2), emprise libre (`decorFits`, rayon `CAVE_R`).
- Faille : un **pinceau qui creuse**. On glisse : les cases dont le centre est à moins de `max(0,75, rayon / 2)` du tracé
  deviennent un ravin (`digRiftAlong`). Refusée sur un bâtiment, une route, un lac, un torrent, la mer ou la plage (hauteur <
  0,15), une grotte ou un autre décor unique, et au bord de la carte.
- Gomme (`World.erase`) : efface forêt, champ, rochers, épave ; **défriche** la case (arbres isolés, buissons,
  fougères, champignons, cailloux et cactus de la carte disparaissent, l'herbe et les fleurs restent) ; comble une case de
  ravin ; sur la moindre case d'un cône, rase le volcan.
- Démolir : un clic sur une case de ravin comble tout le ravin ; sur une grotte, la retire. Pinceau large : routes,
  plantations, décor sauvage et petits bâtiments partent ; grands bâtiments, grottes et failles restent.

### Volcans
- Pose : `volcanoRadius(r) = max(5, 2r)` ; hauteur `1,6 × R` (moins au-delà du rayon 11, où les flancs prennent des ravines).
  Refusé si le cône touche un bâtiment (rayon `R + 1`). La moitié haute du cône perd sa végétation ; la case du cratère porte
  `VEG_VOLCANO`. Un message dit comment le retirer.
- Retrait : Gomme ou Démolir sur le cône (`volcanoAt` : à moins de `0,85 × r` du cratère) ; `removeVolcano` rabat le cône sur
  son pied, raccord doux. Ctrl+Z le remet.
- Réveil : outil Voir, un clic sur le cône ; ou, catastrophes actives, de lui-même tous les 5 à 10 jours de jeu, après 18 s
  de secousses (`wakeVolcano`). La première éruption de la session amène la caméra (`volcanoSeen`).
- Éruption : `ERUPTION_DUR = 16` s (grondement 1,2 s, paroxysme, déclin). Cinq coulées (sept si `r > 12`), parfois un bras ;
  elles avancent encore 10 s, refroidissent, s'effacent 24 s après. Les bombes de plus de 0,26 qui retombent sur un bâtiment
  l'enflamment (30 %, catastrophes actives).
- Lave au sol (`coverLava`) : forêts et champs brûlent, le sol devient basalte (`basalt = 1`) puis la végétation
  revient en trois saisons (`regrow`) ; la case garde des cendres (`ash`) : un champ semé dessus compte double (`sim.ts`,
  `fertile`). Les routes sont épargnées ; les bâtiments ne sont détruits que si les catastrophes sont actives.
- Lac de lave du cratère (`lavaPool`) : il remplit la cuvette (0,3 au-dessus du fond), toujours sous le col le plus bas du
  rebord ; cratère comblé, aplani ou éventré : seule une bouche rougeoie.
- On ne bâtit pas dans le cratère (« Le cratère d’un volcan est ici »).

## Fonctionnement dans le code

### Un coup de pinceau
1. `ToolController.down` : `beginStroke` prend un `snapshot` ; outil de relief : `ctx.target = hit.y` (hauteur affichée du
   clic), `ctx.dig = shift`.
2. `update(dt)` (chaque image, surface) : `sculpt` pour les outils de relief, `applyVeg` toutes les 0,15 s pour la nature ;
   `move` applique aussi la nature et la route.
3. Le premier changement appelle `mark()` : le snapshot part dans `undoStack` (60 au plus), `redoStack` se vide.
4. `sculpt` modifie `heights`, puis `markTerrain` (zone ± 1) et `sanitize` : végétation et routes qui ne tiennent plus sur la
   nouvelle pente s'effacent (`vegFits` en mode tolérant), un ravin noyé disparaît ; `markVeg` ± 2.
5. Boucle (`main.ts`) : le relief se refait au plus toutes les 0,06 s (`terrain.update` → `World.updateVis` sur la zone, puis
   maillage et teintes) ; décors et végétation au plus toutes les 0,12 s, après le relief (`veg.rebuild`, qui refait les
   décors uniques si la zone en touche un : `specialNear`).

### Relief affiché (`updateVis`)
Suréchantillonnage `VR = 2`, trois passes de flou binomial ; le flou s'estompe en altitude et sur les à-pics (chute > 0,35 à
0,7 entre sous-sommets) ; les emprises des bâtiments restent plates (`visPin`). Puis `carveRavines` (failles) et
`raiseCaveKnolls` (buttes des grottes). C'est ce relief que lisent `hAt`, les arbres, la lave, l'eau.

### Failles (`World.rift`)
- `rift[k] = 1` sur chaque case de ravin ; `decor[k] = VEG_FISSURE` (pas de bâtiment, de route, d'arbre). Le relief de jeu ne
  change pas.
- `carveRavines` : chaque sous-sommet au cœur d'un ravin descend selon `riftInner` (sa distance à la plus proche case qui
  n'est pas un ravin, jusqu'à 3) : paroi sur 0,6 case, fond de 2,4 à 3,8 (bruit doux). `ravine[i]` (0 … 1) sert aux teintes
  (paroi, fond sombre), à l'eau (pas de mer au fond : `seaAt`, shader) et aux lacs et torrents (un ravin est un exutoire).
- Décor (`riftGeo`, `vegetation.ts`) : lueur violette le long de l'axe (cases aussi loin des bords que leurs voisines),
  éboulis, blocs sur le rebord, filons dans les parois, spores.
- Entrées : `entranceAt` rend la case de ravin visée ; `outpostEntrance` (lieu des expéditions vers une grotte : une vraie
  grotte d'abord, une faille avec 10 de pénalité) ; `riftEntrances` (un par ravin, son milieu) pour le moteur souterrain
  (`underground.ts`) ; `bearDens` met une tanière au bout de chaque ravin.
- Carte : `addDefaultDecor` pose une seule faille sur une nouvelle carte (version 3 du générateur), cinq sur les cartes des générateurs d'avant, à la forme d'avant le pinceau (`stampFissure` : l'emprise de `decorCells(…,
  VEG_FISSURE)` devient un ravin).

### Le décor sauvage et la gomme
Les arbres isolés, buissons, fougères, champignons et cailloux des prairies ne sont **rangés nulle part** : `VegView.meadow`
et `meadowDetails` les tirent de la case (`hash2`). La gomme ne pouvait donc rien y faire. `World.cleared[k] = 1`
(sauvegardé) les supprime de la case ; `loneTreeAt` dit s'il y a un arbre isolé. Les forêts de la carte, elles, sont des
cases `VEG_FOREST` comme celles qu'on plante.

### Volcans
- `volcanoFrame(cx, cz)` : fond, rebord, pied et rayon, retrouvés en descendant 16 flancs depuis le rebord dans le relief
  affiché (rien n'est sauvegardé que la marque du cratère). Sert à la teinte du cône (`terrainView.ts`), à `volcanoAt`, au
  retrait, aux éruptions.
- `lavaPool` : creux du cratère (± 1,2 autour de la case), col = le plus bas des points hauts de 24 rayons (6 cases), niveau
  `min(fond + 0,3, col - 0,08)`, portée dans chaque direction jusqu'à la paroi ; `vent` si moins de 0,05 de lave. Rendu : une
  étoile plate par volcan (`lavaPoolGeo`), refaite avec les décors uniques.
- Lave vivante (`lavaMaterial`, `vegetation.ts`) : l'attribut `lava` (centre du lac, part du rayon 0 / 0,5 / 1) sert au
  shader ; plaques de croûte en cellules de Voronoï (9 par pixel) qui tournent lentement autour du centre et se déforment,
  chacune rougeoyant à son rythme, fissures orange vif, cœur clair où la lave remonte, croûte dense contre la paroi, pulsation
  lente de tout le lac. Temps : `uTime` de la végétation (`animate`). Couleurs linéaires : une croûte « sombre » doit valoir
  moins de 0,15, l'écran éclaircit beaucoup les sombres.
- Lueur sur les parois (`terrainView.ts`, `lavaU`) : jusqu'à `MAX_LAVA_GLOW` (4) lacs `(x, niveau, z, portée)`, refaits à
  chaque `update` ; lumière émise orange qui monte à 2,6 au-dessus de la lave et vacille, plus forte la nuit (`setNight`). La
  fumée prend aussi la lueur à sa base (`smokeMaterial`).
- Le cône reste brun en toute saison, sans neige : voir [saisons.md](saisons.md).
- `Eruptions.start` refuse une case qui n'est plus un volcan. `update` suit `world.visVersion` : à chaque changement du
  relief, `followRelief` redrape les coulées (hauteur `lift` au-dessus du sol par sommet) et les bombes posées, refait le
  repère du volcan ; un volcan disparu (`gone`) cesse son éruption et ses coulées s'effacent en une seconde.

### Sauvegarde
`toJSON` : `cleared`, `rift` (listes de cases), `decor: 1` (décors de la carte déjà posés). `fromJSON` : une faille d'un clic
(`veg = 8`) devient un ravin de la même emprise. `addDefaultDecor` est rappelé à chaque chargement (`main.ts`) : il ne pose
grottes, failles et épaves qu'une fois (marque `decorDone`), mais rend toujours les gisements de pétrole à une carte qui n'en
a plus (l'âge moderne demande deux puits ; le joueur ne peut pas les effacer).

## Liens avec les autres systèmes
- Eau : creuser sous 0 donne de l'eau ; lacs et torrents se recalculent après le pinceau ; un ravin draine. Voir
  [eau-rivieres.md](eau-rivieres.md).
- Bâtiments : pinceau bloqué au contact ; une emprise s'aplanit à la pose (`flatTarget`) ; rien dans un ravin, une grotte ou
  un cratère. Voir [placement-construction.md](placement-construction.md).
- Routes : leurs sommets ne bougent pas ; `sanitize` retire celles qui deviennent trop raides ; aucune dans un ravin
  (`canRoad`).
- Biomes et neige : `computeBiomes` à chaque `updateVis` (l'altitude refroidit). Voir
  [vegetation-biomes.md](vegetation-biomes.md).
- Expéditions vers une grotte et tanières d'ours : entrées des grottes et des ravins.

## Pièges et invariants
- Le relief affiché est lissé : une marche de moins de ~1,5 sur une case fond presque entièrement. D'où `CLIFF_STEP = 2`.
- Les décors uniques (grottes, ravins, lacs de lave) lisent `hAt` : ils doivent être refaits **après** le relief affiché
  (ordre de la boucle, `specialNear`).
- Une coulée de lave est un ruban figé au départ : sans `followRelief`, la sculpture la laissait en l'air ou enfouie.
- Le disque de lave d'avant, à rayon fixe, sortait en l'air d'un cratère éventré : toujours borner le lac par le col.
- La marque `VEG_VOLCANO` est la seule trace d'un volcan : ne jamais l'écraser (plantation, bâtiment) sans raser le cône.
- `VEG_FISSURE` (8) dans `veg` n'existe plus en jeu : seulement dans les anciennes sauvegardes, converti au chargement ;
  `decor` vaut 8 sur les cases de ravin.
- Une case défrichée le reste même si on y replante puis regomme ; Ctrl+Z la rend (le snapshot contient `cleared` et `rift`).
- Une ancienne sauvegarde sans la marque `decor` reçoit une fois les décors qui lui manquent (même si le joueur les avait
  effacés avant).

## Pour modifier
- Changer la force d'un pinceau : `sculpt` (`terraform.ts`) ; la fiche de l'outil : `TOOL_DESC` (`ui.ts`) et sa traduction
  dans `src/i18n/en/ui.ts`.
- Ajouter un outil de relief : `SculptTool` et `sculpt` (`terraform.ts`), `SCULPT_TOOLS` (`tools.ts`), `TOOL_INFO`,
  `TOOL_DESC` et l'onglet Relief (`ui.ts`), traductions.
- Ajouter une plantation : une valeur `VEG_*` (`world.ts`), `vegFits`, `applyVeg` (`tools.ts`), son rendu dans
  `VegView.buildChunk`, sa sauvegarde (déjà générique dans `veg`).
- Changer la largeur ou la profondeur des ravins : `riftHalf` (`tools.ts`), `carveRavines` (`world.ts`).
- Ajouter un état au terrain à sauvegarder : `Snapshot`, `snapshot`, `restore`, `toJSON`, `fromJSON` (`world.ts`), et
  `newWorld` pour le remettre à zéro.
