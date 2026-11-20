# La cinématique d'ouverture

> Fichiers : `src/openingCine.ts` (la partition : film, bandeaux, fondu de remplacement, plan en direct, `openingDue`), `src/ui/opening.ts` (`OpeningFilm` : le film dans l'écran de chargement), `src/openingStage.ts` (`OpeningStage` : le plan en direct), `src/ui/loading.ts` (`LoadingScreen` en mode `opening`), `src/main.ts` (`boot` : `openingFor`, l'ordre cinématique → contrôles → blason ; `Game.openingStage`, `introOff`, `setIntroOff`), `src/render/fauna.ts` (`wildNear`), `src/ui/ui.ts` (la ligne de Paramètres › Divers), `src/style.css` (« La cinématique d'ouverture »), `public/ouverture/` (la vidéo, à venir), `src/i18n/en/misc.ts` (anglais)
> Tests : `tests/cinematiqueOuverture.test.ts`
> Voir aussi : [grand-choix.md](grand-choix.md) (la traversée, même schéma), [enfers.md](enfers.md) (la cinématique du portail), [tutoriel.md](tutoriel.md), [chargement-performances.md](chargement-performances.md), [interface.md](interface.md)

## En bref
Au début d'une partie neuve, une cinématique courte raconte le passage des nomades aux sédentaires et montre la faune et la flore (demande de l'auteur, 20 nov. 2026 : aux tests, le début de partie était le moment le plus fragile). Même schéma que la traversée « Explorer le monde » : **un film fait par l'auteur avec Gemini, puis un plan en direct dans le jeu**. Environ 22 s, passables à tout moment.

## Règles du jeu
- **Le déroulé** (validé par l'auteur) :
  1. **La nature sauvage** (vidéo, ~8 s) : une vallée vierge au lever du jour, des mammouths, des cerfs, des oiseaux sur la rivière. Bandeau « Il y a très longtemps… · La terre était sauvage ».
  2. **Les nomades** (vidéo, ~8 s) : une petite tribu traverse la vallée, s'arrête au bord de la rivière, le chef plante son bâton ; la caméra monte dans les nuages jusqu'à une nuée unie (`OPEN_CLOUD`, #ece9e2). Bandeau « Un peuple errait · cherchant sa terre ».
  3. **La sédentarisation** (le jeu, `OPEN_LIVE` = 6,5 s) : sur la vraie carte, la nuée se lève (`OPEN_LIFT`), la vue descend du ciel au-dessus d'une bête sauvage proche (un cerf de préférence, `Fauna.wildNear`, à 30 cases au plus ; sans bête, un point en arrière de la vue) et se pose sur la vue de départ de la partie, là où le joueur va allumer le premier feu de camp. Bandeau « Ici, ils allaient bâtir leur foyer ». Le tutoriel enchaîne (« Bienvenue ! », puis « Le cœur du village »).
- **Une seule fois, dans une partie neuve** (`openingDue`) : jamais en reprenant une partie, ni au bac à sable (on y commence à l'âge choisi, sans tutoriel : rien à raconter), ni coupée dans les paramètres. Pas non plus pour les essais lancés par `?n=` en développement (sauf avec `&intro`). « Recommencer cette carte » (`newGame`) est une partie neuve : le film part dès le chargement des modèles.
- **Le réglage** : Paramètres › Divers, « Cinématique d'ouverture · Au début d'une partie » : Activée / Désactivée (`Settings.noIntro`, absent : activée). Il est lu dans les réglages du navigateur au lancement (`loadSettings`), avant que la partie n'existe.
- **Passer, partout** : un clic n'importe où, « Passer », Échap ou Espace.
  - Pendant le film : il s'arrête sur la nuée, le plan en direct ne se jouera pas. Le chargement, lui, va au bout.
  - Pendant le plan en direct : la vue de départ, tout de suite.
- **Ensuite** : le choix des contrôles du premier lancement (`askControls`), puis le blason (`askBlason`), comme sans cinématique. Le tutoriel est là dès le départ, caché sous la cinématique (`body.cinematic` cache `#tuto` et `#tutoRing`).
- **Aucune caméra volée** : à la fin (ou en passant), la vue est exactement celle d'une partie neuve sans cinématique (notée au moment de `prepare`), bornes de zoom et d'inclinaison rendues. Rien ne la reprend ensuite.

## Fonctionnement dans le code
- **Le film tient lieu d'écran de chargement** : `boot` décide (`openingFor`) avant de bâtir la partie, et pose `new LoadingScreen(app, 'opening')` (classe `opening`). `OpeningFilm` lit la WebM, puis le MP4 de secours ; illisibles, introuvables, refusés, ou pas démarrés au bout de 4 s (`START_MS`, réseau lent), c'est le **fondu de remplacement** : l'image de l'accueil retouchée sans village ni maison (`public/ouverture/vallee.webp`, retour de l'auteur : on voyait le village) qui s'approche, les deux bandeaux, puis la nuée, en 8 s (`OPEN_FALLBACK`). Tout y est en animations CSS réglées d'avance (`openFallbackPlan`) : une minuterie restait figée pendant la construction du monde et le second bandeau sautait.
- **Fini avant que la partie ne soit prête**, le film laisse la nuée et ses nuages de papier (`.opSky`, `.opPuff`, animés en transformations seules). Prêt avant la fin, l'écran attend qu'il finisse (`LoadingScreen.done` : classe `ready`, `whenDone`), comme pour la traversée.
- **Le plan en direct se prépare sous l'écran** : après `prepare`, `OpeningStage.prepare` note la vue de départ et pose `#openCine` (nuée opaque, bandes noires) sous `#loadScreen`. L'écran parti (`loading()` faux), le plan part : temps du jeu à ×1 et hors pause pour que les bêtes bougent (`pace`), puis l'état d'avant (la pause du tutoriel jusqu'au feu de camp). `OpeningStage.update` est appelé à chaque image avec le temps réel (plafonné à 0,1 s). `boot` attend `openingStage.finished()` avant `askControls`.
- **La vue** (`openViewAt`) : de 3,4 fois la distance de départ en plongée (1,38 rad) au-dessus de la bête, à la vue de départ ; la hauteur descend vite puis se pose, le point visé glisse de la bête au feu de camp à venir, le cap tourne de 0,9 rad jusqu'au sien. Elle ne remonte jamais (testé).
- `popupBusy` compte le plan (`openingStage.playing`) : les fenêtres automatiques attendent.

## La vidéo
- Attendue dans `public/ouverture/ouverture.webm` (VP9, lue en premier) et `ouverture.mp4` (H.264, secours) : les deux plans collés par un fondu d'une demi-seconde, sans son, 1280 × 720, ~2 Mo chacun. Fabrication : comme la traversée (filtre et réglages ffmpeg dans [grand-choix.md](grand-choix.md), « Fabriquer la vidéo » : garder `scale=out_range=tv` et `-color_range tv`).
- Les prompts Gemini et les images de référence (vrais modèles du jeu sur fond crème) sont dans `.claude/prompts-video-ouverture.md` et `.claude/maquettes-hud/ouverture/` (hors dépôt). Leçon de la traversée : Gemini ignore « finir sur une image donnée » ; on lui donne les modèles en images de référence sur fond uni, et on décrit la fin en mots.
- Après l'intégration : mettre la durée exacte dans `OPEN_FILM.dur` et recaler le second bandeau sur le début du plan 2 (`OPEN_FILM.captions`). Les tests bornent la durée totale (20 à 24 s).

## Pièges et invariants
- Garder l'id `loadScreen` à l'écran du film : le plan en direct attend qu'il disparaisse, et toutes les gardes de fenêtres le lisent.
- La nuée de la fin du film, de l'attente et du voile du plan en direct est la même couleur (#ece9e2) : l'écran s'efface sur le voile sans coupure. La changer partout à la fois (`OPEN_CLOUD`, `style.css`, le prompt du plan 2).
- Pas de scène 3D ni d'animation CSS hors transformations et opacité pendant le chargement (voir [chargement-performances.md](chargement-performances.md)).
- Le film prend Échap et Espace tant que l'écran est là ; le plan en direct ne les prend qu'une fois parti (sinon une touche passerait les deux).
- Rien de la cinématique n'est enregistré dans la partie : une partie neuve fermée pendant elle, déjà sauvegardée, se reprend ensuite sans elle. Le seul champ nouveau est le réglage `noIntro` (absent : activée), les anciens réglages se lisent tels quels.

## Pour modifier
- **Bandeaux, durées** : `OPEN_FILM`, `OPEN_LIVE`, `OPEN_LIVE_CAPTION`, `OPEN_LIFT` (`openingCine.ts`), textes anglais dans `src/i18n/en/misc.ts`, sans point-virgule.
- **Le trajet de la vue** : `openViewAt` ; la bête visée : la liste d'espèces passée à `wildNear` dans `main.ts`.
- **Quand elle se joue** : `openingDue`, et `openingFor` dans `boot`.
