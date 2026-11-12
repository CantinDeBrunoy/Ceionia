# Chargement et performances

> Fichiers : `src/main.ts` (`boot`, `Game.prepare`, `Game.warmUp`, `Game.frame` et `Game.advance`, préparation du soir), `src/ui/loading.ts` (`LoadingScreen`, `painted`), `src/render/precompile.ts` (`representatives`, `compilePaced`, `compileNow`, `firstUseAll`), `src/render/fauna.ts` (`bakeSilhouettes`), `src/render/impostors.ts` (`ensure`), `src/render/warmup.ts` (`WarmUp`, `stillCompiling`), `src/render/glow.ts` (`Glow.allocate`, `nightJobs`, `precompile`, `warm`), `src/render/adaptive.ts` (qualité « Auto »), `src/style.css` (`#loadScreen`)
> Tests : `tests/chargement.test.ts`, `tests/qualite.test.ts`
> Voir aussi : [architecture.md](architecture.md), [rendu-modeles.md](rendu-modeles.md), [ciel-meteo.md](ciel-meteo.md), [faune.md](faune.md), [traduction.md](traduction.md)

## En bref
Le premier affichage d'un objet compile ses shaders (ses « programmes »). Chaque programme fige l'image de 20 à 100 ms. À l'arrivée sur le monde, environ 75 programmes se compilaient d'un coup : 7 à 8 s d'écran figé. Au premier soir, autant encore : le halo de nuit rend la scène dans une image intermédiaire, et chaque matériau y a une autre variante de shader. Désormais, un écran de chargement couvre la vue. Derrière lui, le monde se bâtit, les shaders du jour et de la nuit se compilent par paquets, puis quelques images tournent pour de bon. L'écran s'efface ensuite en fondu.

## Règles du jeu
- Étapes affichées, dans l'ordre (textes passés par `tr`, anglais dans `src/i18n/en/menu.ts`) :
  1. « Chargement des modèles… 14/83 » : au lancement de la page, avant l'accueil (barre de 0 à 20 %).
  2. « Construction du monde… » : la partie choisie se bâtit (22 puis 26 %).
  3. « Préparation des matériaux… » : shaders de l'écran (de 30 à 85 %, avec la suivante).
  4. « Préparation de la nuit… » : shaders du halo. Seulement si le halo est actif.
  5. « Dernières retouches… » : une image avec halo (88 %).
  6. « Premières images… » : la boucle tourne pour de bon sous l'écran ; la barre va de 90 à 100 % à mesure que les images passent fluides (`WarmUp.progress`).
- L'écran se lève après `SMOOTH_SPAN_MS` = 1 200 ms d'images de suite sous `SMOOTH_MS` = 40 ms ; une image lente remet le compte à zéro. Au plus `WARM_MAX_MS` = 8 000 ms d'images d'essai : une machine lente ne reste pas bloquée (`warmup.ts`). Avant, 4 images fluides suffisaient (environ 70 ms) : ce qui se bâtissait ou se compilait juste après (un shader tardif, 167 ms mesurés 1,2 s après le lever) tombait sous les yeux du joueur. Mesure après le changement (partie reprise, 1 600 × 900, mode développement) : aucune image au-dessus de 40 ms dans les 16 s qui suivent le lever ; le lever arrive environ 1 s plus tard.
- Habillage (`loading.ts`, `style.css`) : le fond animé de l'accueil (`menuBg` : la vidéo `public/menu/fond.mp4` sur l'image `fond.webp`) voilé de clair au centre, l'emblème (rose des vents et montagnes, SVG `EMBLEM`), « Ceionia », l'étape, la barre bleue, et un conseil (`LOAD_TIPS`) qui change toutes les `TIP_MS` = 4,5 s, tiré au hasard au départ. Les conseils passent par `tr` (anglais dans `src/i18n/en/menu.ts`).
- Fondu de 0,5 s (`#loadScreen.out`, `style.css`). La partie tourne déjà dessous ; l'écran bloque les clics tant qu'il est là.
- Pendant les images d'essai, le temps de jeu avance (moins d'une seconde en général) ; la qualité « Auto » ne les juge pas.
- Le message d'accueil (`ui.info`) va dans la cloche : il ne se perd pas sous l'écran.

### Coûts mesurés
Chrome sans fenêtre, RTX 3060, Direct3D 11, build de production, profil neuf (cache de shaders vide). Machine partagée avec d'autres travaux : ordres de grandeur.

| Moment | Avant | Après |
| --- | --- | --- |
| Nouvelle partie : jouable après le clic | 8,9 à 10,5 s, écran figé tout du long (1,2 à 1,3 s, puis 6,9 à 8,3 s) | 5,6 à 6,2 s sous l'écran de chargement (au plus 1,3 à 1,6 s figées, à la construction) ; ensuite, images de 25 ms au plus |
| Partie reprise (même session, cache du navigateur chaud) | 2,4 à 2,5 s, dont 0,9 puis 1,3 s figées | 3,0 à 3,1 s sous l'écran (au plus 0,9 à 1,1 s figées) |
| Premier soir (le halo s'allume vers 17 h 40) | 5,9 à 6,0 s figées (78 programmes) ; 0,5 s avec le cache chaud | images de 28 à 54 ms au plus, aucun programme neuf |
| Deuxième soir | rien (< 60 ms) | rien |
| Programmes compilés au chargement | 72 (jour seul) | 180 à 190 (jour et nuit) |

Le chargement d'une partie reprise s'allonge d'environ 0,6 s quand le cache est chaud : la nuit s'y prépare aussi. En échange, le premier soir ne fige plus rien.

D'autres premières fois, mesurées après ce chantier (mode développement) : pluie, orage et neige sans à-coup notable (< 100 ms). Incendie : de rien à 0,6 s selon les essais, sans shader neuf (habitants et secours qui accourent). Première éruption : à-coups de 150 à 330 ms (la caméra file au volcan, silhouettes des bêtes proches), parfois davantage sur la machine chargée. Pose d'une sorte de bâtiment nouvelle : un programme, 100 à 360 ms avec la reconstruction des routes. Un saut de saison d'un coup (`time.setSeason`, mode développeur) : 0,4 s (teintes du sol, routes), sans shader neuf.

## Fonctionnement dans le code

### Démarrage (`main.ts` › `boot`)
1. `LoadingScreen` posé dans `#app`, à côté de `#ui` et non dedans : `new UI` réécrit le contenu de `#ui` en se construisant. Puis `loadModels`, avec l'étape des modèles.
2. Accueil : l'écran des modèles disparaît d'un coup (`done(true)`). Lancement automatique (`AUTOSTART` : changement de langue, nouvelle partie, import) : le même écran continue.
3. `start` (async) : étape « Construction du monde… », `painted()` (l'écran s'affiche avant le long calcul), retrait de l'accueil, `setMapSize`, `new Game` (synchrone, 1 à 2 s : génération ou lecture de la sauvegarde, toutes les vues). Le constructeur ne lance plus la boucle d'images. Puis `await game.prepare(ld)` et `ld.done()`.

### `Game.prepare(screen)`
1. `advance()` une fois, sans rendu : ce que la première image bâtit (bêtes de `Fauna.refresh`, chemins…) existe avant la compilation.
2. `representatives(scene)` (`precompile.ts`) : un objet par matériau et par variante, objets cachés compris (halos, lune, lucioles…). La variante (`variant`) reprend ce qui change le shader d'un même matériau dans three : maillage instancié, couleur par instance, articulé, lot, attributs `normal` / `uv` / `tangent`, couleurs RGB ou RGBA, morphs.
3. Halo actif (`glow` et `gfx.glow`) : `Glow.allocate()` d'abord. Allouer une cible de rendu interroge le pilote, et cette question attend la fin de toutes les compilations lancées.
4. `compilePaced` : objet par objet (`renderer.compile` sur un faux groupe qui ne parcourt que lui, lumières et brouillard de la vraie scène). Tous les `BATCH` = 32 programmes lancés, on attend qu'ils soient prêts, puis on rend la main : la barre avance. Travaux : l'écran (cible `null`), puis la nuit (`Glow.nightJobs` : la scène dans `composer.renderTarget1`, les passes du flou sur des carrés).
5. « Dernières retouches… », puis `firstUseAll` : tout est montré le temps de deux images (élimination hors champ levée, représentants cachés et leurs parents rendus visibles), une à l'écran avec la passe d'ombres forcée, puis `Glow.warm` (une image avec halo). Chaque programme sert ainsi une première fois, maillages et textures partent au GPU, les images du flou s'allouent, et `OutputPass` se compile (ses réglages ne se fixent qu'à son premier rendu). Tout est remis en l'état ensuite.
6. `warmUp` : la boucle démarre ; chaque image passe par `WarmUp.feed`, et `warmStep` avance la barre. La promesse se tient quand l'écran peut se lever.
7. Une erreur dans les étapes 1 à 5 est écrite en console, et la boucle démarre quand même.

`Game.loadStats` (`__game.loadStats`) garde les durées (ms) : `build`, `firstStep`, `compile`, `firstUse` (les deux images de `firstUseAll`), `warmUp`, les nombres de programmes (`programs0` lancés, `programs` en tout) et `firstUsed` (objets montrés en plus pour ces images).

### La boucle : `frame` et `advance`
`advance()` fait tout sauf le rendu (temps, simulation, vues) et rend le temps écoulé depuis l'image précédente. `frame()` = `requestAnimationFrame`, `advance`, `renderer_render`, puis `WarmUp.feed` pendant les images d'essai. `adapt` (qualité « Auto ») n'est pas appelé tant que `warming` existe.

### Pourquoi la nuit coûtait
`Glow.render` (force ≥ 0,02, soit `env.night` ≥ 0,36, vers 17 h 40) rend la scène dans une image en virgule flottante, puis `OutputPass` corrige les tons. Pour une cible non nulle, three prend `NoToneMapping` et `LinearSRGBColorSpace` : chaque matériau a donc un deuxième programme. S'y ajoutent les 8 passes du flou (`UnrealBloomPass`) et la sortie.

### Le soir : ce qui est apparu depuis le chargement
Dans `Game.advance` (vue de la surface) : une fois par jour de jeu, entre 15 h et 17 h (`eveningReady`), `glow.precompile` lance sans attendre les variantes de nuit de ce qui est apparu depuis : bêtes de passage (`Fauna`, groupes « visiteurs ») et leurs silhouettes (`Impostors`), bâtiments posés. Coût : 25 à 40 ms pour environ 3 500 objets, plus les programmes neufs.

## Liens avec les autres systèmes
- Qualité ([rendu-modeles.md](rendu-modeles.md)) : sans halo (réglages Normal et Bas, palier « Auto » ≥ 2, puce modeste qui démarre au palier 2), pas de préparation de nuit. Si « Auto » remonte sous le palier 2 en cours de partie, le passage de 15 h compile tout le halo d'un coup : l'image se fige l'après-midi, plus au soir.
- Petits écrans tactiles (`coarse`) : pas de `Glow`, donc pas de nuit à préparer.
- Faune ([faune.md](faune.md)) : les maillages instanciés des espèces ont leur couleur par instance dès la création (`Fauna` constructeur). Les chauves-souris ne sortent que la nuit : sans cela, leur shader changeait au premier soir.
- Éruptions (`eruption.ts`) : une coulée vide et cachée porte le matériau de la lave dès le départ (clé de programme `lavaflow`).
- Enfers et monde souterrain : leurs scènes ne passent pas par ce mécanisme. `fadeThrough` (monde souterrain, retour des Enfers par la cinématique de fin) garde deux images derrière le voile noir, `loadThrough` (entrée aux Enfers et retour) trois derrière l'écran de chargement ; la première descente compile encore.
- Traduction ([traduction.md](traduction.md)) : les étapes sont dans `src/i18n/en/menu.ts`.

### La première rotation de la vue
Mesuré (Chrome sans fenêtre, 1 600 × 900, halo actif, nouvelle partie) : en tournant la vue juste après le lever de l'écran, une image de 100 à 220 ms dans presque chaque essai. Le profil la plaçait dans `onFirstUse` → `getProgramInfoLog` : un shader neuf, ou compilé mais jamais encore servi. Deux causes :
- **Le premier usage.** Sous Direct3D (ANGLE), un programme lancé par `renderer.compile` n'est fini qu'à son premier usage réel. Un objet hors champ ou caché au chargement ne servait jamais sous l'écran. Remède : `firstUseAll`.
- **Les bêtes et leurs silhouettes.** Les visiteurs (`Fauna.scout`) arrivent près de ce que regarde la caméra. Leurs bêtes articulées (`SkinnedMesh`), leurs ombres et leurs silhouettes lointaines (`Impostors`, maillages instanciés pris au premier besoin) avaient des variantes de shader qu'aucun objet n'avait au chargement. Remède : `Fauna.bakeSilhouettes`, au constructeur, prend la silhouette de chaque robe et de chaque modèle (`Impostors.ensure`) et garde un exemplaire caché de chaque bête dans `fauna.samples`.

Après : 8 essais sur 8 sans image au-dessus de 34 ms pendant 5 s de rotation. Coût : environ 0,4 s de plus à la construction (bêtes et silhouettes) et 0,5 s à l'image de premier usage, sous l'écran.

## Pièges et invariants
- Créer maillages et matériaux au démarrage, cachés au besoin (`visible = false`, `count = 0`), plutôt qu'à leur première apparition : tout ce qui est dans la scène se compile au chargement, même caché.
- `setColorAt` crée `instanceColor` au premier appel, et le shader change. Appeler `setColorAt(0, blanc)` à la création (faune, éruption, particules, feuilles).
- Une lumière se crée éteinte (intensité 0) dès le départ. Changer le nombre de lumières visibles recompile tous les matériaux de la scène.
- Ne pas basculer à la volée (nuit, saison, météo) ce qui entre dans le shader : `transparent`, `vertexColors`, `flatShading`, `fog`, une carte de texture, des `defines`, `needsUpdate`. Passer par des uniformes.
- Un matériau partagé entre un maillage simple, un instancié et un articulé : un programme par sorte. `representatives` les couvre s'ils existent au chargement ; sinon, ils se compilent à leur apparition.
- Toute question synchrone au pilote (`getExtension`, `getProgramParameter`, allocation d'une cible, lecture de pixels) attend la fin des compilations en cours. Allouer avant de compiler.
- Sur ce Chrome (Direct3D 11), la compilation « en parallèle » (KHR_parallel_shader_compile) n'empêche pas l'attente : `isReady` bloque jusqu'à la fin du paquet. D'où des paquets de 32 : assez gros pour garder le parallélisme (un seul gros paquet : 2,6 s ; paquets de 8 : 5 s ; paquets de 32 : 3,2 s), assez petits pour que la barre avance (au plus 0,3 à 0,6 s figées).
- Sans l'extension, `isReady` est toujours vrai : `compilePaced` attend alors l'édition des liens (`LINK_STATUS`), paquet par paquet.
- Le navigateur garde les programmes compilés en cache : une partie reprise dans la même session se charge bien plus vite. Mesurer avec un profil neuf pour le pire cas.
- `renderer.compile` ne suffit pas : un programme qui n'a jamais servi fige encore à son premier usage (Direct3D). Tout objet qui doit paraître plus tard doit être dans la scène au chargement, même caché, pour que `firstUseAll` le montre une fois.
- Un maillage créé « au premier besoin » (silhouettes, effets, bêtes d'une sorte encore jamais vue) échappe à toute la préparation. Le créer d'avance, vide ou caché, comme `bakeSilhouettes`.
- L'écran de chargement vit dans `#app`. Le placer dans `#ui` le ferait disparaître à la construction de l'interface.

## Comment mesurer les à-coups
- Le panneau du navigateur de l'application, masqué, ne donne aucune image (`requestAnimationFrame` à l'arrêt) : inutilisable pour mesurer. Méthode utilisée : Chrome sans fenêtre, piloté par le protocole DevTools (petit script Node hors du dépôt, `WebSocket` intégré).
- Lancer Chrome avec `--headless=new --use-angle=d3d11 --enable-gpu --remote-debugging-port=…` et un dossier de profil neuf (cache de shaders vide). Imposer un écran de bureau : `Emulation.setDeviceMetricsOverride` (1 600 × 900, écran 1 920 × 1 080). Sinon l'écran fait 800 × 600, le jeu passe en mode tactile (`coarse`) et n'a pas de halo.
- Dans la page (`Runtime.evaluate`) : enregistrer la durée entre deux `requestAnimationFrame`, avec `__game.time.hour` et `__game.glow.renderer.info.programs.length`. Cliquer sur `.mPlay[data-d="normal"]` (nouvelle partie) ou `.mGo` (reprise) depuis la page.
- Soir rapide : `__game.time.paused = false; __game.time.hour = 17; __game.time.dayLen = 24` (une heure de jeu par seconde ; le halo s'allume vers 17 h 40).
- Savoir qui compile : comparer `renderer.info.programs` avant et après ; pour chaque objet de `__game.scene`, `renderer.properties.get(matériau).currentProgram`. Une pile d'appels au moment de la création : envelopper `programs.push`.
- Où passe le temps : `Profiler.start` / `Profiler.stop`. `getProgramInfoLog` ou `getProgramParameter` en tête : attente de compilation.
- Build de production : `npx vite build --outDir …` puis `npx vite preview --port … --outDir …`. Le mode développement donne les mêmes ordres de grandeur, avec des piles lisibles.
- Répéter chaque mesure : sur une machine partagée, une image figée de plusieurs secondes peut venir d'ailleurs.

## Pour modifier
- **Ajouter un conseil** : une phrase dans `LOAD_TIPS` (`loading.ts`) et sa traduction dans `src/i18n/en/menu.ts`. Ne citer que ce qui existe vraiment dans le jeu.
- **Ajouter une étape à l'écran** : `screen.step('Texte…', part)` dans `Game.prepare` ou `start` (`main.ts`), suivi de `await painted()` avant un long calcul. Traduction dans `src/i18n/en/menu.ts` ; ajouter le texte à `tests/chargement.test.ts`.
- **Ajouter une bête articulée ou un modèle de faune** : rien à faire si elle passe par `SPECS` / `MODELS` et les clés de `populate` (`beast:{sorte}:{robe}`, `model:{nom}`) : `bakeSilhouettes` les prend d'avance. Une autre clé de silhouette doit y être ajoutée.
- **Ajouter un effet qui ne paraît qu'à certains moments** (nuit, hiver, éruption, fête) : son maillage et son matériau au constructeur de la vue, cachés. Vérifier avec la mesure ci-dessus qu'aucun programme ne se compile au moment voulu.
- **Ajouter une passe de post-traitement** : ses matériaux dans `Glow.nightJobs` (un carré chacun), ou dans l'image réelle de `Glow.warm` si ses réglages ne se fixent qu'au rendu.
- **Régler le lever de l'écran** : `SMOOTH_MS`, `SMOOTH_SPAN_MS`, `WARM_MAX_MS` (`warmup.ts`) ; la taille des paquets : `BATCH` (`precompile.ts`).
