# Chargement et performances

> Fichiers : `src/main.ts` (`boot`, `Game.prepare`, `Game.warmUp`, `Game.frame` et `Game.advance`, préparation du soir, `ageToPrep` et `prepAge`), `src/render/agePrep.ts` (`AgePrep`, l'âge suivant préparé au repos), `src/render/thumbs.ts` (`prepare`), `src/render/buildings.ts` (`prepareAge`), `src/ui/loading.ts` (`LoadingScreen`, `painted`), `src/render/precompile.ts` (`representatives`, `compilePaced`, `compileNow`, `firstUseAll`), `src/render/fauna.ts` (`bakeSilhouettes`), `src/render/impostors.ts` (`ensure`), `src/render/warmup.ts` (`WarmUp`, `stillCompiling`), `src/render/glow.ts` (`Glow.allocate`, `nightJobs`, `precompile`, `warm`), `src/render/adaptive.ts` (qualité « Auto »), `src/render/still.ts` (branches immobiles), `src/render/snow.ts` (`setSnowMap`), `src/render/terrainView.ts` (`stepRecolor`), `src/style.css` (`#loadScreen`, `.mtitle`, `.newAge`), `src/ui/preload.ts` (`preloadPics`, `whenIdle`), `src/ui/minimap.ts` (`shownW`)
> Tests : `tests/chargement.test.ts`, `tests/qualite.test.ts`, `tests/saisons.test.ts` (balayage du sol), `tests/glaceBiomes.test.ts` (carte de neige)
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
1. `LoadingScreen` posé dans `#app`, à côté de `#ui` et non dedans : `new UI` réécrit le contenu de `#ui` en se construisant. Il montre le même logo que l'accueil (`LOGO_PEAKS`, exporté par `loading.ts` et repris par `ui.ts`, et « Ceionia » en Fraunces crème), sur le paysage assombri au centre, avec l'étape et le conseil en crème et une barre dorée. Puis `loadModels`, avec l'étape des modèles. Après « Explorer le monde » (`AUTOSTART` = `carte|continue|voyage`), l'écran est en mode traversée (`new LoadingScreen(app, true)`, classe `voyage`) : le film de la cinématique, repris où il en était avant le rechargement, puis la brume peinte s'il finit avant le chargement, sans logo ni conseil, l'avancée en filet doré. Prêt avant la fin du film, l'écran attend qu'il finisse. Le survol des îles attend dessous et prépare ses plans (voir [grand-choix.md](grand-choix.md), avec la mesure des à-coups). Une partie neuve (hors bac à sable, réglage non coupé) a de même le mode ouverture (`new LoadingScreen(app, 'opening')`, classe `opening`) : le film de la cinématique d'ouverture, ou son fondu de remplacement en CSS, puis la nuée ; le plan en direct attend dessous (voir [ouverture.md](ouverture.md)).
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

## L'ouverture des fenêtres (popups)
Mesure du 15 nov. 2026 : Chrome sans fenêtre, RTX 3060, Direct3D 11, 1 600 × 900, build de production, qualité « Auto » (descendue au palier sans halo sur cette machine chargée), partie au Médiéval avec 82 bâtiments et 176 habitants. Chaque fenêtre ouverte une fois juste après le chargement, cache du navigateur vidé ; trois essais, en alternant l'ancienne et la nouvelle version. On compte l'image la plus longue et les images au-dessus de 33 ms dans la seconde qui suit l'ouverture (60 images en tout). Base au repos : 17 ms.

| Fenêtre | Image la plus longue (ms), avant → après | Images > 33 ms, avant → après |
| --- | --- | --- |
| Nouvel âge (`showNewAge`) | 33 → 17 | 2 → 0 |
| Retour d'expédition (`showReport`) | 17 → 33 | 0 → 1 |
| Grand choix (`WorldChoice`) | 17 → 17 | 0 → 0 |
| Choix de l'allié, dénouement (`DiploChoice`) | 17 → 17 | 0 → 0 |
| Portail (`PortalChoice`) | 33 → 33 | 1 → 1 |
| Message, conseil, bannière | 17 → 17 | 0 → 0 |
| Expéditions | 34 → 33 | 2 → 1 |
| Paramètres | 17 → 17 | 0 → 0 |

(médiane des trois essais ; 33 ms = une seule image ratée). Ce que coûte une fenêtre, mesuré à part : construction du DOM 0 à 5 ms, style et mise en page 1 à 9 ms (expéditions : le plus lourd), aucun shader neuf. Une expédition jouée de bout en bout (départ, imprévu, décision, retour) dans une partie rechargée : aucune image au-dessus de 45 ms, aucun programme neuf. Sur cette machine, ouvrir une fenêtre ne fige donc pas le jeu ; les écarts du tableau sont du bruit.

Ce qui a été corrigé quand même, parce que la mesure le montrait :
- **La mini-carte forçait la mise en page à chaque image** (`minimap.ts`) : sa boucle lisait `offsetParent` et `clientWidth`. L'image qui suit l'ouverture d'une fenêtre, cette lecture payait le style et la mise en page de la fenêtre en plein script (1 à 8 ms selon la fenêtre, 36 à 42 ms une fois), puis le jeu réécrivait l'interface et tout se refaisait au rendu. La largeur vient maintenant d'un `ResizeObserver` : 0,1 ms après, pour toutes les fenêtres.
- **`updateExpeditions`** (`ui.ts`) lit toutes ses tailles avant d'écrire ses styles : une mise en page de moins à chaque mise à jour de l'interface.
- **Les images des fenêtres** (`preload.ts`, `UI.preloadArt`) se chargent et se décodent au repos, une par moment de repos : à la fin du chargement et à chaque passage d'âge (grand choix, portail, paramètres, bandeau et illustrations des expéditions de l'âge). Avant, la première ouverture allait chercher ses images sur le réseau : en ligne, la fenêtre paraissait d'abord sans elles.
- **La sauvegarde automatique** (toutes les 15 s, synchrone : 7 à 9 ms sur ce village, davantage sur un grand) attend le prochain moment de repos (`whenIdle`) au lieu de s'ajouter à l'image en cours.

Restent, vus pendant ces mesures, sans rapport direct avec les fenêtres :
- **Le passage d'âge** : traité à part, voir ci-dessous.
- **Un shader compilé en pleine partie** : une fois, 65 ms (`getProgramInfoLog`) au départ de la première expédition d'une session ; pas reproduit dans une partie rechargée.
- Le flou d'arrière-plan des fenêtres (`backdrop-filter`) ne change rien ici à la durée des images (17 ms, flou ou non), sauf le titre collant flouté et l'animation d'entrée de la fenêtre du nouvel âge (voir « La fenêtre du nouvel âge » plus bas) ; à revoir sur une machine où le halo est actif.

### Mesurer les fenêtres
- Harnais dans la page : durée entre deux `requestAnimationFrame`, et `PerformanceObserver` `long-animation-frame` (scripts en cause, `forcedStyleAndLayoutDuration`). Une trace DevTools complète fausse tout : images de plusieurs secondes.
- Ouvrir une fenêtre directement : `__game.ui.showNewAge(…)`, `showReport({ ok, m, redo, summary, notes, text, c })`, `openExpeditions()`, `openSettings()`, `__game.worldChoice.show()`, `__game.diploChoice.showAlly()` / `showPath()`, `__game.portalChoice.show()`.
- Pour le premier affichage : `Network.clearBrowserCache`, puis recharger la partie.
- Chrome sans limite d'images (`--disable-gpu-vsync --disable-frame-rate-limit`) sature la machine : à éviter.

## Le passage d'âge
Mesure du 16 nov. 2026 : Chrome sans fenêtre, RTX 3060, Direct3D 11, 1 600 × 900, build de production, profil neuf, qualité « Auto » (sans halo sur cette machine). Village de test (`tools/bench/page.js` › `setup`) : 120 bâtiments et 240 habitants à l'Antiquité, sauvegardé puis rechargé ; passage à l'âge médiéval par le même chemin que `Sim.advance` (`age`, `ageBase`, `onAgeUp`). On compte les images entre deux `requestAnimationFrame` dans les 1,5 s qui suivent le passage, puis autour de la fenêtre du nouvel âge (3,3 à 4,6 s). Machine partagée avec d'autres travaux (au repos aussi, des images de 33 à 50 ms) : six essais de chaque version, en alternant (pour « après », les trois derniers avec la coupe des pas de la faune), médianes et étendues. Base au repos : 17 ms.

| Moment | Image la plus longue (ms), avant → après | Images > 33 ms, avant → après | Images > 50 ms, avant → après |
| --- | --- | --- | --- |
| 1,5 s après le passage | 75 → 50 (de 50 à 650 → de 34 à 67) | 6 → 2,5 (de 2 à 8 → de 1 à 13) | 1,5 → 0 (de 0 à 4 → de 0 à 1) |
| Fenêtre du nouvel âge (3,3 à 4,6 s) | 67 → 83 (de 33 à 83 → de 67 à 100) | 1 → 1 | 1 → 1 |

Aucun programme (shader) neuf au passage (223 avant et après) : rien à compiler d'avance. Ce qui coûtait, mesuré image par image (temps de `Game.frame`, avant) :
- **Les vignettes de la barre de construction** au nouvel âge (`Thumbs.pump`, une par image) : 6 à 14 ms chacune, dont la lecture des pixels (`readRenderTargetPixels`, qui attend la carte graphique : bien plus quand elle est chargée) et l'encodage PNG.
- **Le premier modèle de chaque sorte au nouvel âge** (`BuildingView.refresh` › `getModel`, à l'évolution du bâtiment, un toutes les 0,06 s) : 15 à 20 ms ; les suivants de la même sorte, 5 à 6 ms.
- **Le recensement de la faune** (`Fauna.refreshGen`, relancé par le changement d'âge) : des pas de 15 à 22 ms au lieu des 4 ms voulus (`seaRoom` deux fois de suite, les zones de vie d'un bloc).
- **Les routes** refaites au style du nouvel âge (`Roads.step`) : 8 à 12 ms par image pendant une dizaine d'images, déjà étalé.
- Le tout tombait sur les mêmes images : 35 à 52 ms de script par image pendant 0,6 s.

Ce qui est fait :
- **L'âge suivant se prépare au repos** (`AgePrep`, `agePrep.ts`). Dès que les conditions du passage sont réunies (`Sim.ready`, revu toutes les 0,5 s par `Game.ageToPrep`, en surface, hors bac à sable et hors chargement), `Game.prepAge` rend les vignettes de l'âge suivant (`Thumbs.prepare` : celles qui changent et celles qui apparaissent, les sortes jusqu'à l'âge suivant + 1) puis bâtit les modèles qu'auront les bâtiments (`BuildingView.prepareAge`, gardés par le cache de `getModel`). Un pas au moins par moment de repos (`requestIdleCallback`, au plus tard après `WAIT_MS` = 1,5 s), d'autres tant qu'il reste `SLACK_MS` = 6 ms. La clé (âge visé, nombre de bâtiments, `nextId`) relance la préparation quand le village change ; ce qui est déjà fait est sauté vite. Sur le village de test : 170 pas, 5 à 23 s selon la charge de la machine.
- **La faune coupe ses pas longs** : un pas par `seaRoom`, et les zones de vie en trois pas.
- Au passage, il ne reste que les routes, le recensement de la faune et l'échange des modèles déjà prêts : des images de 22 à 37 ms de script.

- **La fenêtre du nouvel âge** (`showNewAge`, 3,6 s après), réglée le 24 nov. 2026, voir ci-dessous.

Ce qui reste :
- Un passage d'âge juste après la réunion des conditions (avant la fin de la préparation) fait le reste comme avant.
- Au bac à sable (`setAge`), rien n'est préparé : l'âge s'y change à volonté.

### La fenêtre du nouvel âge
Avant : une image de 75 à 140 ms à sa première ouverture (7 à 13 images par seconde le temps d'un battement), dont 15 à 20 ms de script. Le reste n'était ni du script ni du style : le fil principal attendait la composition (`long-animation-frame` : 80 ms avant le début du rendu, sans script). Ce n'étaient ni des images à décoder (les icônes sont des SVG en ligne), ni le filtre gris des tuiles fermées, ni les polices. En retirant un à un les effets (CSS ajouté avant l'ouverture), deux causes :
- **Le flou d'arrière-plan du titre** (`.mtitle`, `backdrop-filter: blur(14px) saturate(1.4)`) : un titre collant flouté, dans une fenêtre déjà floutée, sur un voile flouté. Il coûtait à lui seul 70 à 80 ms, ouverture directe comme après un passage d'âge. Les fenêtres des expéditions, de l'envoi, des cartes de choix (`cePop`) et du menu l'avaient déjà retiré : c'est pourquoi en ouvrir une avant ne changeait rien. Remède : plus de flou sur `.mtitle`, un fond blanc plus couvrant (0,92 au lieu de 0,82) pour cacher le texte qui défile dessous. Sur la capture, la fenêtre au repos est la même. Ceci vaut pour toutes les fenêtres génériques (`modal`).
- **L'animation d'entrée** (`rise`) : 3,6 s après un passage d'âge (pas en ouverture directe), animer la fenêtre floutée coûtait encore une image de 40 à 50 ms, en fondu comme en glissement, et même en n'animant que son contenu. Remède : `.newAge` sans animation d'entrée, la fenêtre paraît d'un coup.

Mesure du 24 nov. 2026 : Chrome sans fenêtre, RTX 3060, 1 600 × 900, serveur de développement, profil neuf par essai, machine partagée avec trois autres sessions. Partie neuve à l'Antiquité (`'3|fresh|normal|1'`), village de test de 120 bâtiments et 240 habitants, âge suivant préparé (`agePrep.idle`), puis le passage. Image la plus longue entre 3,3 et 4,6 s, quatre essais de chaque, en alternant (« avant » : l'ancien CSS remis par une feuille ajoutée) :

| | Image la plus longue | En images par seconde |
| --- | --- | --- |
| Avant | 76, 97, 93, 91 ms | 10 à 13 |
| Après | 17, 17, 17, 17 ms | 60, aucune image ratée |

En ouverture directe (`showNewAge(2)` sans passage) : 86 à 104 ms avant, 17 à 18 ms après.

### Mesurer le passage d'âge
- Même méthode que pour les fenêtres (Chrome sans fenêtre, protocole DevTools, `--mute-audio` et `AudioContext` remplacé avant tout script par `Page.addScriptToEvaluateOnNewDocument`). Partie lancée par `sessionStorage['village-lowpoly:autostart'] = '3|new|normal'`, village bâti par `__bench.setup({ buildings: 120, pop: 240, age: 1 })` (`tools/bench/page.js` évalué dans la page), `saveNow`, puis rechargement avec `'3|continue'`.
- Pour que la préparation se fasse (le village de test ne remplit pas les conditions) : `Object.defineProperty(__game.sim, 'ready', { get: () => true, configurable: true })`, attendre `__game.agePrep.idle`, puis `delete __game.sim.ready` avant le passage.
- Le passage : `g.sim.age = 2; g.world.ageBase = { ...g.sim.counts }; g.sim.onAgeUp(2)`.
- Le détail par image : envelopper `g.frame` et les méthodes des vues (`thumbs.pump`, `buildings.refresh`, `roads.step`, `fauna.update`…) d'un chronomètre. Le profileur (`Profiler.start`) fige lui-même une image de 300 à 400 ms à son départ : le lancer quelques secondes avant.

## Le régime normal
Mesure du 18 nov. 2026 : Chrome sans fenêtre, Ryzen 5 5600, RTX 3060, Direct3D 11, 1 600 × 900, build de production, qualité « haute ». Carte de 384, village de test de 260 bâtiments à l'âge Moderne (`tools/bench/page.js` › `setup`), vue moyenne (distance 34). Plan complet, chiffres par village et par vue, et suite prévue : `.claude/plan-perfs.md`.

Ce que la mesure a montré :
- **Le goulot est le script, pas la carte graphique** : 13,4 ms de script par image en médiane, 10 à 13 ms de carte graphique.
- **La taille du village ne compte presque pas** : 25 ou 260 bâtiments, même coût à 1 ms près. C'est le monde (végétation, faune, sol) qui coûte.
- **Les saccades venaient des saisons** : toutes les 2 s, la carte de neige recalculée (25 ms) ; toutes les 4 s, le sol reteinté par bandes (8 ms par image pendant une seconde). 287 images sur 1 247 au-dessus de 20 ms.
- **Baisser la qualité ne soulage pas le script** : processeur bridé ×4, 9 à 11 images par seconde à toutes les qualités.

| Sur 24 s, vue fixe | Avant | Après |
| --- | --- | --- |
| Images au-dessus de 20 ms | 287 sur 1 247 | 60 sur 1 385 |
| Images au-dessus de 33 ms | 25 | 2 |
| Script, 95e centile | 26,1 ms | 19,7 ms |
| Script, 99e centile | 39,9 ms | 23,5 ms |
| Passage de saison (`refreshSeason`) | 23,5 ms toutes les 2 s | 1,2 ms |
| Bande de reteinte du sol | 7,6 ms, 384 images | 1,6 ms, 743 images |
| Matrices de la scène | 2,0 ms | 1,2 ms |
| Ombres, vue en rotation | 2,5 ms et 770 appels | 1,3 ms et 562 appels |

La machine était plus chargée pendant les mesures « après » : la médiane (13,4 puis 12,5 ms) sous-estime le gain. Les lignes par poste sont fiables.

Ce qui est fait :
- **Carte de neige** (`snow.ts` › `setSnowMap`) : refaite seulement si une case a changé de biome.
- **Teintes du sol** (`terrainView.ts` › `stepRecolor`, `update(…, tint)`) : une bande de saison ne refait plus ce qui ne dépend que du monde ; 2 ms par image au plus (`RECOLOR_MS`) ; un balayage tous les 6 pas de saison (`GROUND_STEP`, `main.ts`).
- **Matrices** (`still.ts`) : la végétation et les bêtes témoins sont des branches immobiles.
- **Tuiles de végétation** (`VegView.update`) : visibilité revue seulement quand la vue bouge.
- **Ombres** (`renderer_render`) : refaites à chaque image seulement quand leur cadre bouge, plus quand la vue tourne.
- **Arbres** (`vegetation.ts` › `TREE_DETAIL`) : la version détaillée seulement à moins de 16 cases de la vue. De 13,3 à 9,1 millions de triangles par image en vue moyenne (14,5 à 8,5 en rotation), sans différence visible.
- **Grand lointain** (`FAR_DETAIL`, `Layer.setLod2`) : une troisième version des arbres au-delà de 72 cases. Vue de très loin : 11,2 à 7,3 millions de triangles.
- **Petites mises à jour** : son 20 fois par seconde (`AUDIO_STEP`), drapeaux lointains figés (`SWAY_FAR`, `buildings.ts`), fumées vides sans envoi (`Puffs.update`).

Ce qui reste, par ordre de gain (voir le plan) : les triangles qui restent à la végétation (7 millions sur 9 : petits décors sans version simplifiée, herbe) et ses appels de dessin, la faune qui parcourt toute la carte (1,7 à 2,8 ms), les matrices des bâtiments (0,4 ms), la falaise du bord refaite d'un coup à la fin d'un balayage (une image de 12 à 17 ms toutes les 12 s), des leviers de script pour la qualité « Auto ».

### Mesurer le régime normal
- Même montage que pour les à-coups (Chrome sans fenêtre, son coupé). Qualité fixée (`setQuality('high')`) : « Auto » changerait les réglages en cours de mesure.
- Lancer une carte de 384 : en développement `?n=384&seed=11`. En production, une nouvelle partie démarre en 192.
- **Piège** : à partir de l'âge 2, la carte du grand choix s'ouvre toute seule (`worldChoice.show`) et arrête la simulation (`ui.menuOpen()`). Les coûts de la saison, des habitants et du trafic tombent alors à zéro sans prévenir. Neutraliser `show` et vérifier `menuOpen()` après chaque mesure.
- **Piège** : `tools/bench/page.js` cache l'interface (`body.photo`) et lit `g.gardens.group` et `g.life.group`, qui n'existent plus (`counts`, `ablate`).
- Mesurer image par image, pas seulement en moyenne : les pointes de saison ne pèsent que 0,3 ms en moyenne et figent pourtant une image toutes les 2 s. Compter les images au-dessus de 20 et de 33 ms sur 24 s (deux balayages du sol).
- Le temps de script varie de ±2 ms selon la charge de la machine. Comparer les postes un par un (chronos autour de `refreshSeason`, `stepRecolor`, `scene.updateMatrixWorld`, `shadowMap.render`), ou alterner les deux versions.
- `scene.updateMatrixWorld` : three passe toujours `force = true` aux enfants (une matrice automatique marque son objet à chaque image). Un objet à `matrixWorldAutoUpdate = false` est quand même parcouru : pour sortir une branche du calcul, `still`.
- En boucle serrée, les matrices de toute la scène prennent 0,6 ms ; dans une vraie image, 2,3 ms (mémoire froide). Chronométrer dans la boucle du jeu.

## Pièges et invariants
- Un calcul fait à chaque pas de saison (toutes les 2 s) tombe d'un bloc sur une image : au-delà de 2 ms, l'étaler ou le garder en cache. Ce qui ne dépend que du monde (biomes, relief) ne se refait pas avec la saison.
- Un objet ajouté sous `VegView.group` ou `Fauna.samples` ailleurs qu'à l'origine ne s'affichera pas à sa place sans `refresh` (`still.ts`).
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
- Ne pas lire une taille (`offsetParent`, `clientWidth`, `getBoundingClientRect`) dans un rappel d'image : dès que le DOM a changé, la lecture force le style et la mise en page en plein script. Garder la taille d'un `ResizeObserver`, ou lire toutes les tailles avant d'écrire.
- L'écran de chargement vit dans `#app`. Le placer dans `#ui` le ferait disparaître à la construction de l'interface.
- Ce qui change d'aspect au passage d'âge et coûte à bâtir (vignettes, modèles) se prépare d'avance dans `Game.prepAge`. Un nouveau coût du passage d'âge (une texture, une géométrie par âge) y a sa place, en pas courts (un `yield` après chaque morceau de quelques ms).

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
