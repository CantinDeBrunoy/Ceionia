# Rendu et modèles 3D

> Fichiers : `src/render/models.ts` (13 700 lignes : les modèles procéduraux de tous les bâtiments, par âge), `src/render/parts.ts` (`Parts`, constructeur de géométries), `src/render/buildings.ts` (`BuildingView` : un bâtiment du monde → ses maillages), `src/render/batch.ts` (`GeoBatch`, lots `BatchedMesh`), `src/render/impostors.ts` (silhouettes lointaines des bêtes), `src/render/assets.ts` (modèles `.glb` externes), `src/render/materials.ts` (matériaux, lumières de fenêtres, eau, neige), `src/render/textures.ts` (sol, vagues), `src/render/adaptive.ts` + `src/render/gpu.ts` (qualité), `src/render/glow.ts` (halo), `src/render/halos.ts` (flaques de lumière), `src/render/snow.ts`
> Tests : `tests/rendu.test.ts` (parcelle, plafond de triangles, tailles), `tests/lots.test.ts` (`mergeLit`, `GeoBatch`), `tests/silhouettes.test.ts`, `tests/fusionModeles.test.ts`, `tests/qualite.test.ts`, `tests/futur.test.ts`, `tests/jardins.test.ts`
> Voir aussi : [architecture.md](architecture.md), [batiments-catalogue.md](batiments-catalogue.md), [ages.md](ages.md), [chargement-performances.md](chargement-performances.md), [ciel-meteo.md](ciel-meteo.md), [faune.md](faune.md), [jardins.md](jardins.md), [remparts.md](remparts.md)

## En bref
Presque tous les bâtiments sont **dessinés par le jeu** : chaque sorte a une fonction qui empile des boîtes, cylindres, cônes et sphères (`Parts`) et rend deux géométries fusionnées (corps, lumières). Le résultat est mis en cache par sorte, âge et variante, puis `BuildingView` en fait des instances d'un lot dessiné en un seul appel. Seules quelques pièces sont des modèles externes `.glb` (CC0 ou CC-BY). La qualité graphique se règle à la main ou toute seule (`adaptive.ts`).

## Règles du jeu
- Le style : faces plates (`flatShading`), couleurs de sommets, pas de texture sur les bâtiments. Les couleurs viennent de la palette `C` (`models.ts`) ; les murs (`WALLS`) et toits (`ROOFS`) varient avec la variante `v` de la case.
- Un bâtiment prend le modèle de **l'âge du village** : quand `sim.age` monte, `BuildingView.update` fait évoluer les bâtiments un par un (écrasement puis regonflement, 0,8 s ; un tirage toutes les 0,06 s) et change `b.age`. Les âges : 0 Préhistoire, 1 Antiquité, 2 Médiéval, 3 Industriel, 4 Moderne, 5 Futuriste (`AGES`, `build/catalog.ts`).
- Plafond de triangles d'un modèle (test `rendu.test.ts`, constante `CAP`) : 3 000 pour 1 × 1, 4 500 pour 2 × 2, 6 500 pour 3 × 3 ; un modèle ne dépasse pas sa parcelle (aux arbres près).
- Réglages graphiques (`PRESETS`, `adaptive.ts`) : `high` (finesse 1,5, ombres 2048, halo), `medium` (1,25, 1536, pas de halo), `low` (1, 1024, pas de brume). Réglage « Auto » : 6 paliers (`MAX_LEVEL`) qui rognent par ordre de visibilité croissante.

## Fonctionnement dans le code

### De la sorte de bâtiment au maillage
1. `BuildingView.refresh(b)` (à la pose, au changement d'âge ou de voisinage) calcule `ModelOpts` (`opts` : variante `v` tirée de la case par `hash2`, `L`/`R`/`F` voisines et façade sur rue pour les maisons, `row` bloc de toit, `tier` rang dans la ligne d'horizon futuriste par `skylineTier`, `mask` raccords des remparts, `small` ancien 1 × 1) puis appelle **`getModel(kind, age, opts)`**.
2. `getModel` (fin de `models.ts`) : modèle importé s'il existe (`importedModel`, table `IMPORTED` : il ne reste que les fermes `a_farm`, `a_farm2` à l'Antiquité) ; sinon clé de cache `kind|age|v%3|taille…` (les maisons : `v`, voisines, bloc, rang), `Parts` neuf, remise à zéro des « sorties » du module (`smokeOut`, `attachOut`, `swayOut`, `crowdOut`, `spinOut`, `vaneOut`, `sinkOut`), puis :
   - âge ≥ 5 : `futureModel` (liste des sortes qui ont un modèle futuriste) ; les autres reçoivent le modèle moderne (âge 4) plus `futureExtras` (liserés néon, hologramme, drone) ;
   - sinon un grand `switch (kind)` appelle la fonction de la sorte : `house(p, age, o)`, `farm`, `well`, `workshop`, `temple`, … Chaque fonction se sépare ensuite **par âge** (ex. `house` → `prehistoricHut`, `antiqueHouse`, `medievalHouse`, `industrialHouse`, `modernHouse`), ou prend `Math.max(âge minimal, age)` quand la sorte n'existe qu'à partir d'un âge.
3. Retour : `Model { body, glow, smoke, rotor?, vane?, sways?, crowd? }` (interface en tête de fichier) : corps et lumières fusionnés (`Parts.build`, avec fausse occlusion ambiante au pied des murs), sommets des cheminées, pièce tournante (ailes, pales, coupole), tête face au vent, pièces qui se balancent, personnages animés.
4. Mise à l'échelle : `UPSCALE = ['temple','workshop','mill']` (dessinés pour 1 case, posés sur 2 × 2, agrandis de `UP = 1,85`) et le forum passé de 2 × 2 à 3 × 3 (×1,5) ; `lifeK` rapetisse leurs personnages d'autant (ils gardent la taille d'un habitant). `sinkOut` : un modèle sans dalle s'enfonce de son épaisseur moins 1 cm.

### Organisation de `models.ts` (par ordre dans le fichier)
- Tête : importations (`THREE`, `Parts`, `assets`, `circus.ts`, `defenses.ts`, `ramparts.ts`, `fireEngine.ts`, `rocket.ts`), `IMPORTED`, `FIT`, `roofLines`, `importedExtras`, `importedModel`, palette `C`, `WALLS`, `ROOFS`, `ModelOpts`, `Model`.
- **Outils de construction** (modules à état, remis à zéro par `getModel`) : `sink`, `sway` / `swing` / `turning` (pièces qui bougent, dessinées autour de leur pivot), `animPart` (personnages animés : pivot, axe, amplitude, fréquence, phase, rebond lus par le shader `crowdMat`), `lifeSize`, `placed` (reprend un dessin d'une case au milieu d'une grande place, tourné et agrandi), `smoke`, `attach` (pose un `.glb` sur la parcelle), `unshaded`, `recolorTop`, `tileRoof`, `lift`, puis petits éléments réutilisés : `steps`, `statue`, `pediment`, `column`, `roof` (toit à pans, `RoofOpts`), `slab`, `windows`, `ivy`, `timbers`, `figure`, `seated`, `crowd`…
- **Fonctions par sorte** : maisons et huttes, enclos et fermes, puits, atelier, lieu de rencontre (`gather`, `gatherPlaza`), temple, moulin, gare, santé, école, pompiers, écurie, rucher, thermes, taverne, mine, avant-poste, scierie, carrière, phare, port, chantier naval, halle aux poissons, ferme marine, stades, parcs d'attraction, zoo, théâtre, acropole, forum, sénat, raffinerie, briqueterie…
- **Âge futuriste** : palette `F` et `NC`, `futureHouse`, `futureOffice` (hauteurs `FUTURE_HOUSE_H`), `futureModel`, `cyberTower`, `spaceport`, `arcology`…
- Fin : `cache`, `getModel`, puis les créatures de l'eau des expéditions (`shark`, `crocodile`, `tentacle`, `krakenHead`, `harpoon`). `defenses.ts` (tours de garde et casernes par âge), `ramparts.ts`, `circus.ts` sont des fichiers à part appelés avec un petit « kit » (`DEF_KIT`, `CIRCUS_KIT`) pour partager `sway`, `smoke`, `turning`.
- `Parts` (`parts.ts`) : `box`, `cyl`, `cone`, `sphere`, `pyramid`, `gable`, `add(géométrie, x, y, z, couleur, rotation, lumière)`. Le 7e argument `glow` met la pièce dans le groupe des lumières : `true` = fenêtre ou flamme (`aLight` : graine > 0 fenêtre, < 0 flamme chaude), `'neon'` = néon de sa couleur. **Toutes les coordonnées sont locales à la parcelle**, origine au centre, façade vers +z, `y` vers le haut ; 1 unité = 1 case.

### Matériaux et lumières (`materials.ts`)
- `mats.body`, `mats.glow`, `mats.ghost` (aperçu de pose, vert ou rouge : `setGhostValid`), **`mats.lit`** : corps et lumières dans un seul maillage (les sommets sans graine `aLight` sont le corps, les autres sont des lumières). `mergeLit(body, glow)` fond les deux (graine nulle → `LIT_FIXED` pour une lumière fixe).
- Shaders greffés (`onBeforeCompile`) : `addLights` (fenêtres qui s'allument à leur heure, `LIGHTS = { hour, time, night }` mis à jour dans `env.ts`, flammes qui vacillent, néons), `addWater` (faces horizontales bleues : vaguelettes, reflets, caustiques), `addSnow` (`snow.ts` : neige sur les faces tournées vers le ciel, selon le biome). `crowdMat` : personnages animés des bâtiments.
- Textures (`textures.ts`) : `groundDetailTexture` (herbe, sable, roche, un motif par canal) et `waterNormalTexture`, pour le terrain seulement.

### Instanciation (`batch.ts`, `buildings.ts`)
- `GeoBatch` : un `THREE.BatchedMesh`. Chaque géométrie partagée n'y est copiée qu'une fois (compteur d'utilisateurs), chaque instance a sa matrice ; le lot grandit seul (instances, sommets), se tasse quand des géométries sont retirées, et refuse sans erreur une géométrie aux attributs différents (`add` rend −1 : le maillage se dessine alors lui-même). `frustumCulled = false` : le lot couvre toute la carte.
- `BuildingView` a trois lots : `batch` (corps+lumières, `mats.lit`, 512 instances / 2¹⁹ sommets de départ), `swayBatch` (pièces mobiles), `crowdBatch` (personnages). Chaque `Entry` garde un maillage « porteur » (caché si son contenu est dans le lot) qui porte la place, l'échelle et l'animation ; `syncBatch` recopie sa matrice quand `moved`, ou pendant une animation. Ne pas oublier `e.moved = true` quand on déplace une pièce.
- Sol : `plinth` (fondation de pierre, butte de terre aux premiers âges, pied de roche de l'acropole) quand le terrain n'est pas plat ; `drape` déforme une copie du modèle pour que le lieu de rencontre (place, marché) épouse la pente ; le modèle se pose à la hauteur médiane de son emprise (au plus bas pour le lampadaire et le ponton, au plus haut pour l'enclos).
- `Impostors` (`impostors.ts`) ne concerne **pas** les bâtiments : c'est la silhouette figée des bêtes lointaines (`fauna.ts`), dessinée par lots `InstancedMesh`, une par sorte ([faune.md](faune.md)).

### Modèles externes (`assets.ts`)
- `NAMES` : la liste des `.glb` chargés de `public/models/` (`loadModels`, en parallèle ; un modèle absent ou illisible → `hasModel` faux → version procédurale). Familles : bêtes de ferme et sauvages, faune marine, arbres et plantes des biomes, sous-bois, créatures des grottes, Préhistoire (`p_*`), Antiquité (`a_*`), enclos (`f_*`), chien.
- Le `.glb` est « cuit » : `bakeStatic` (couleurs des matériaux et de leur atlas lues au point UV de chaque sommet → couleurs de sommets), `bakeFit(nom, largeur, rotation, recoloration?)` (ramené à une largeur, posé à y = 0, centré), `makeActor` (bêtes animées : squelette cloné, mixeur d'animations), `mergeSkinned` (fusion des pièces d'un squelette en un maillage), `meshVariants`, `splitTrees`.
- Les bâtiments importés passent par `importedModel` (échelle `FIT`) ou `attach` à l'intérieur d'un modèle procédural (puits préhistorique, temple et vases antiques, tour de garde `a_tower`).
- **Licences et crédits** : CC0 (Quaternius, Kenney, Kay Lousberg, MiniPoly, Mohabins, iPoly3D, MilkAndBanana, reyshapes) ; **CC-BY 3.0** : « Greek Temple » d'Alexandre Thomas (`a_temple`), « Amphora » de Bruno Oliveira (`a_amphora`), « Eight Vases » de Paul Spooner (`a_vases`). Ces trois-là **doivent rester cités** : écran Crédits (`showCredits`, `ui/ui.ts`, menu et Réglages) et `README.md` à la racine. Tout nouveau modèle : ajouter son auteur et sa licence aux deux.
- `public/models/` contient 66 fichiers que le code ne charge plus (les `b_*` des packs KayKit et Kenney, `adventurer`, `bush`, `farmer`, `hooded`, `man`, `mini_*`, `rocks`, `villager_*`, `woman*`, `worker`), environ 15,6 Mo recopiés dans `dist/`. À supprimer si l'on ne s'en sert plus (à confirmer avec l'auteur ; les crédits restent corrects).

### Qualité adaptative (`adaptive.ts`, `gpu.ts`, `main.ts`)
- `Preset` `high|medium|low` ; `paramsAt(base, palier)` calcule les `GfxParams` (finesse, taille et fréquence des ombres, distance des bêtes détaillées, distance des arbres détaillés `vegLod`, halo, brume, densité de particules). Palier 1 : finesse ×0,9 ; 2 : plus de halo, ombres une image sur 3 ; 3 : ombres divisées par 2 ; 4 : plus de brume ; 5 et 6 : finesse jusqu'à ×0,5.
- `AdaptiveQuality.step(ms)` (appelé chaque image par `Game.adapt`, seulement en réglage « Auto » et onglet visible) : moyenne glissante du temps d'image ; au-dessus de `slowMs` = 28 ms pendant `patience` = 2 s → palier suivant ; sous `fastMs` = 15 ms pendant `calmNeeded` = 10 s → palier précédent ; 3 s de repos après une baisse, 5 s après une hausse ; une hausse aussitôt reprise double l'attente (jusqu'à 120 s). Un à-coup isolé est écrêté à 100 ms.
- `weakGpu(nomDuRendu, cœurs)` (`gpu.ts`) : puce intégrée, mobile ou logicielle reconnue par son nom (liste de motifs) → pas d'anticrénelage et palier de départ 2. `Game.applyQuality` applique les paramètres (pixel ratio, ombres via `env.setShadowSize`, `fauna.detail`, `veg.lodDist`, brume, densité) ; le palier atteint se sauvegarde (`autoLevel`).
- Ombres : la carte des ombres ne se refait qu'une image sur `gfx.shadowEvery` quand la caméra est immobile (`renderer_render`).

### Halos et glow
- `Glow` (`glow.ts`) : `EffectComposer` + `UnrealBloomPass` (bloom). N'est utilisé que si `strength ≥ 0,02` : de jour, rendu direct. Force = `night × 0,8` (nuit), 0,3 sous terre ; seuil 1,3 (2 sous terre) ; aux Enfers, `hellMode.view.bloom`. Absent sur les petits écrans (`coarse`). Son filtre écarte les pixels non finis (NaN) et borne l'éclat à 32.
- `Halos` (`halos.ts`) : flaques de lumière chaude drapées sur le sol autour des feux, braseros, lampadaires, lanternes de routes et de voies (`Game.refreshHalos` rassemble les sources : x, z, rayon, intensité) ; opacité ∝ nuit, vacille.

## Liens avec les autres systèmes
- Les bâtiments évoluent selon `sim.age` ([ages.md](ages.md)) ; leur taille et leur sorte viennent de `KINDS` ([batiments-catalogue.md](batiments-catalogue.md)).
- La fumée des cheminées (`Model.smoke`, `BuildingView.chimneys`) alimente `life.ts` ; les lumières de nuit suivent `env.night` ([ciel-meteo.md](ciel-meteo.md)).
- Les jardins, remparts et défenses de l'île ont leurs propres fichiers de rendu ([jardins.md](jardins.md), [remparts.md](remparts.md), [portail-ile.md](portail-ile.md)).
- L'aperçu de pose (`tools.ts`) appelle `getModel` avec `v: 0` et `mats.ghost`.

## Pièges et invariants
- `getModel` utilise des **variables de module** (`smokeOut`, `attachOut`, `swayOut`, `crowdOut`, `mainParts`, `lifeK`…) : une fonction de modèle ne doit jamais appeler `getModel` (réentrance) ; elle écrit seulement dans `Parts` et les aides (`smoke`, `sway`, `attach`).
- Le cache est par **clé** : si une nouvelle option change le dessin, l'ajouter à la clé (`getModel` et la clé de `refresh`), sinon deux bâtiments se partagent un modèle faux. Les géométries du cache sont **partagées** : ne jamais les modifier après coup (`drape` travaille sur une copie).
- Toutes les géométries d'un même lot doivent avoir les mêmes attributs : d'où `mergeLit` (tout en `Float32`, `aLight`) ; un modèle qui n'y entre pas se dessine seul (plus lent, pas une erreur).
- Pas de texture sur les bâtiments (couleurs de sommets seulement) ; les `.glb` sont cuits en couleurs de sommets.
- Aucune puissance d'un nombre négatif ni division par zéro dans un shader : un seul pixel NaN a déjà noirci tout l'écran la nuit (le halo l'étalait ; correctif dans `glow.ts`).
- Un `.glb` qui manque est un cas normal (repli procédural) : ne pas supposer `hasModel(...)` vrai.
- Les personnages d'un modèle sont dessinés avec `animPart` ; seuls ceux posés sur le modèle lui-même s'animent (pas ceux d'une pièce déjà mobile).
- Éviter les gros modèles « décor » : un bâtiment coûte un morceau de lot, mais ses triangles comptent aussi dans la carte des ombres.
- Le fichier est énorme (13 700 lignes) : chercher une fonction par son nom (`function medievalHouse`), pas par défilement. Un nouveau modèle volumineux va dans son propre fichier (comme `defenses.ts`, `circus.ts`).

## Pour modifier
**Retoucher un modèle existant** : trouver la fonction de la sorte (`function <sorte>` dans `models.ts`) puis la branche de l'âge ; modifier les `p.box(...)` ; garder `x`, `z` dans la parcelle (demi-largeur = taille / 2 ; test `rendu.test.ts`) et sous le plafond de triangles ; lancer `npx vitest run tests/rendu.test.ts`.

**Ajouter un bâtiment (partie rendu)** : (1) l'entrée dans le catalogue ([batiments-catalogue.md](batiments-catalogue.md)) ; (2) une fonction `function <sorte>(p: Parts, age: number)` dans `models.ts`, ou un fichier à part ; (3) un `case '<sorte>'` dans le `switch` de `getModel` ; (4) si la sorte change au futur, un `case` dans `futureModel` (sinon elle reçoit le modèle moderne + `futureExtras`) ; (5) lumières : `glow = true` sur les fenêtres et les flammes ; cheminée : `smoke(x, y, z, 0|1|2)` ; (6) taille ≥ 2 dessinée pour 1 case : l'ajouter à `UPSCALE` ; (7) une icône (`ui/icons.ts`, [interface.md](interface.md)) ; (8) `npx vitest run tests/rendu.test.ts tests/futur.test.ts`.

**Ajouter un modèle externe** : déposer le `.glb` dans `public/models/`, ajouter son nom à `NAMES` (`assets.ts`), l'utiliser par `attach([...], v, largeur, x, z)` ou `IMPORTED` ; **ajouter l'auteur et la licence** à `showCredits` et au `README.md` ; vérifier la licence (CC0 ou CC-BY, pas de NC).

**Ajouter un réglage graphique** : champ dans `GfxParams` et dans les trois `PRESETS` (`adaptive.ts`), calcul dans `paramsAt` pour les paliers, application dans `Game.applyQuality` ; compléter `tests/qualite.test.ts`.
