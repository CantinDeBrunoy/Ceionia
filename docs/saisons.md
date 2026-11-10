# Saisons

> Fichiers : `src/render/seasonConfig.ts` (les quatre fiches, palette de départ, proportions des essences), `src/render/season.ts` (`SeasonState`, `computeSeason`, `seasonOf`), `src/render/seasonShaders.ts` (`addPalette`, `addCover`, `pickPalette`), `src/core/time.ts` (`GameTime.mix`), et les vues qui lisent l'état : `vegetation.ts`, `terrainView.ts`, `streams.ts`, `env.ts`, `atmosphere.ts`, `life.ts`, `gardens.ts`.
> Tests : `tests/saisons.test.ts`, `tests/neigeRoutes.test.ts`.
> Voir aussi : [vegetation-biomes.md](vegetation-biomes.md), [eau-rivieres.md](eau-rivieres.md), [ciel-meteo.md](ciel-meteo.md), [chargement-performances.md](chargement-performances.md)

## En bref
Chaque saison a une **fiche** dans `seasonConfig.ts` : sol, arbres, végétation basse, eau, lumière, effets. Les couleurs s'y écrivent `'#rrggbb'`. `computeSeason` interpole chaque nombre et chaque couleur d'une fiche à la suivante pendant la transition (`GameTime.mix`), sur place, dans un `SeasonState` que toutes les vues lisent. Les **teintes** passent par des uniforms (rien à reconstruire) ; la **forme et le nombre** des décors (feuillage, neige, fleurs, herbe, champignons, feuilles mortes, roseaux) passent par la reconstruction des tuiles de végétation, déjà étalée sur les images.

## Règles du jeu
- Printemps : cerisiers roses et blancs en bosquets, jeunes verts, prairies fleuries par taches, buissons fleuris, pétales qui tombent et dérivent sur les rivières, courant plus vif.
- Été : feuillage dense et vert soutenu, quelques plaques d'herbe sèche, eau turquoise, soleil plus fort (ombres plus marquées).
- Automne : feuillus orange, jaunes, rouges, quelques-uns restés verts ; chute des feuilles décalée d'un arbre à l'autre ; litière rousse sous les forêts, tas de feuilles, champignons ; feuilles qui dérivent sur l'eau ; lumière plus douce et orangée.
- Hiver : feuillus nus (quelques-uns gardent des feuilles sèches), neige sur le sol, les branches, les buissons et les rochers ; l'eau gèle depuis les rives, le courant fort reste libre, rien ne gèle sous les tropiques ni au désert ; les lacs gardent des trous d'eau libre, les chutes coulent encore ; lumière froide, ombres bleutées, quelques flocons par temps clair.
- La neige ne tient que la première moitié de l'hiver (fonte de `seasonT` 3,5 à 3,9) ; la glace suit la neige (`iceNow`).
- Désert et tropiques gardent leurs buissons (couche `shrubDry`) et leurs fleurs propres ; les palettes ne s'appliquent qu'aux biomes à saisons.

## Fonctionnement dans le code

### Fiche et état
- `SeasonDef` : `snow`, `leaf`, `growth` ; `terrain` (herbe, plaques, terre apparente, litière, berges, cultures) ; `trees` (palettes `blossom`, `leafy`, `conifer`, écart de feuillage `leafSpread`) ; `ground` (palettes des touffes, buissons, fleurs ; hauteur de l'herbe, buissons fleuris, densité des fleurs, fougère, champignons, tas de feuilles, mousse des rochers, roseaux des berges) ; `water` (hauts-fonds, grand fond, limpidité, reflets, rugosité, courant, gel, débris qui dérivent) ; `light` (soleil, ciel, ambiance, sol, brouillard, brume) ; `fx` (pétales, feuilles, vent, couleurs des feuilles, flocons).
- `SEASONS` : les quatre fiches dans l'ordre du temps (0 printemps … 3 hiver). `SNOW_COLORS`, `ICE_COLOR`, `PETAL_COLORS`, `SPECIES` (parts des sapins, des arbres à fleurs, de leurs bosquets) ne changent pas avec la saison.
- `SeasonState` = fiche vivante (couleurs en `THREE.Color`) + `index` (saison qui domine) + `iceNow` (gel du moment, nul sous 0,35 de neige) + raccourcis d'origine (`grass`, `foliage`, `foliage2`, `crop`, `tint`) qui **pointent** sur les objets de la fiche. `seasonOf(i)` donne l'état d'une saison franche.

### Palettes par instance (`addPalette`)
- Quatre teintes et leurs parts. Le shader de sommet tire une valeur par instance : mélange d'un hachage par arbre et d'un bruit doux à l'échelle de quelques cases (`cluster`), étirée pour garder à peu près les parts. Les bords entre deux teintes sont fondus : aucun arbre ne change d'un coup quand les parts bougent.
- La case 3 est celle des « retardataires » : bourgeons clairs au printemps, arbres restés verts à l'automne. Une place garde la même case toute l'année.
- La couleur du matériau est mise à blanc ; la teinte multiplie les couleurs de sommet (ombre du modèle) et d'instance (éclat, teinte du biome : `SHRUB_TINT`, `TUFT_TINT`).
- Branché par `VegView.applySeason` (`pals.*.set(...)`) : feuillus à fleurs, autres feuillus, saules, sapins, touffes, buissons. Fleurs et tas de feuilles prennent leur teinte à la construction (`pickPalette`).

### Le reste
- Sol (`TerrainView.update`) : plaques `terrain.patch` (bruit `patch`), taches `terrain.soil` (bruit `wobble`, sur le plat), litière `terrain.litter` sous les forêts, haut des berges `terrain.bank` entre le sable et l'herbe ; neige aux couleurs `SNOW_COLORS`.
- Eau de mer et rivières (`TerrainView.seasonWater`, appelée par `animateWater`) : `uShallow`/`uDeep` pointent sur la fiche ; `uFlowT` cumule `dt × water.flow` (la vitesse change sans faire sauter les stries) ; débris qui dérivent (`uFloat`, `uFloatK`) ; glace (`uIce`) selon la profondeur, le courant et la carte de neige (`SNOW_U`).
- Lacs et torrents (`Streams.update(dt, saison, …)`) : voir [eau-rivieres.md](eau-rivieres.md).
- Rochers : `addCover` (mousse ou feuilles sur le dessus, plus épaisse près de l'eau, uniforms `COVER`), posé après `addSnow` pour passer dessous.
- Lumière (`Environment.update`) : soleil `light.sun × sunK`, ciel teinté `light.sky × skyK`, ambiance (`hemi`) mêlée de `light.ambient`, sol `light.ground`, brouillard × `haze` ; flocons par temps clair (`fx.flurries`, 18 % des points de neige). Brume : `light.mist` (`atmosphere.ts`).
- Pétales et feuilles qui tombent (`life.ts`) : taux `fx.petals + fx.leaves`, dérive `fx.wind`, couleurs `PETAL_COLORS` ou `fx.leafColors`.
- Reconstruction (`VegView.applySeason`) : signature de 10 réglages (feuillage, neige, croissance, fleurs, hauteur de l'herbe, champignons, tas de feuilles, buissons fleuris, écart de feuillage, roseaux) ; dès que l'un bouge de plus de 0,03, toutes les tuiles repartent en file.

## Liens avec les autres systèmes
- [ciel-meteo.md](ciel-meteo.md) : temps de jeu, transition `mix()`, météo par saison.
- [vegetation-biomes.md](vegetation-biomes.md) : couches de végétation, biomes, facteurs de neige.
- [eau-rivieres.md](eau-rivieres.md) : courant (`flowTex`), lacs, torrents.
- [jardins.md](jardins.md) : les jardins lisent `leaf`, `snow`, `foliage2`.

## Pièges et invariants
- `lerpInto` interpole sur place les objets de l'état : ne jamais remplacer une couleur de l'état par une autre (`s.grass = …`) : les uniforms et les raccourcis pointent dessus.
- Une palette a toujours 4 teintes et des parts qui font 1 (test).
- Un nombre qui pilote une animation (courant) se cumule côté processeur ; ne pas multiplier un temps absolu par un réglage de saison dans un shader (les stries sauteraient pendant la transition).
- Un réglage qui change la forme ou le nombre des décors doit entrer dans la signature de `applySeason`, sinon il ne s'applique qu'à la prochaine reconstruction.
- Les shaders ajoutés se posent à la construction des matériaux, jamais à la volée (voir [chargement-performances.md](chargement-performances.md)) ; `addPalette` et `addCover` enchaînent l'`onBeforeCompile` précédent, `addWind` l'écrase : `addWind` d'abord.

## Pour modifier
- **Une teinte, une densité, une lumière** : la fiche de la saison dans `seasonConfig.ts` ; lancer `tests/saisons.test.ts`.
- **La part des cerisiers, des sapins, la taille des bosquets** : `SPECIES`.
- **Un nouveau réglage** : l'ajouter à `SeasonDef` et aux quatre fiches (TypeScript l'exige), le lire dans la vue ; s'il change la forme des décors, l'ajouter à la signature de `applySeason`.
- **Une nouvelle matière teintée par saison** : `addPalette(mat, cluster)` à la construction, puis `handle.set(s.…)` dans `applySeason`.
