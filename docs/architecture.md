# Architecture

> Fichiers : `src/main.ts` (démarrage, classe `Game`, boucle), `src/core/time.ts` (`GameTime`), `src/core/camera.ts` (`CameraRig`), `src/core/surface.ts` (`SurfaceGate`), `src/core/rng.ts` (graines, `clamp`), `src/hellMode.ts` (vue des Enfers), `index.html`, `vite.config.ts`, `wrangler.jsonc`
> Tests : `tests/remonteeSurface.test.ts`, `tests/saisons.test.ts`, `tests/suivi.test.ts`, `tests/qualite.test.ts`
> Voir aussi : [sauvegarde.md](sauvegarde.md), [chargement-performances.md](chargement-performances.md), [interface.md](interface.md), [rendu-modeles.md](rendu-modeles.md), [ciel-meteo.md](ciel-meteo.md), [portail-ile.md](portail-ile.md), [enfers.md](enfers.md)

## En bref
Une seule page, une seule instance de `Game` (créée dans `main.ts`, exposée en `window.__game`). Elle possède le monde (`World`), la simulation (`Sim`), tous les sous-systèmes de rendu et d'animation, l'interface (`UI`) et la caméra. `Game.frame()` tourne à chaque image (`requestAnimationFrame`) et appelle tout, dans un ordre fixe. Changer de langue, recommencer ou revenir au menu **recharge la page** : il n'y a pas de ré-initialisation en place.

## Démarrage
1. `index.html` : `canvas#view`, trois calques d'effets (`#fx-vignette`, `#fx-tilt-top`, `#fx-tilt-bottom`) et `#ui` (racine de toute l'interface). Script : `src/main.ts`.
2. À l'import de `main.ts` : `style.css`, puis `./i18n/en` (dictionnaires anglais **et** `i18n/data.ts`, qui localise les données du catalogue), puis, au niveau du module : `coarse` (pointeur grossier ou petit écran < 700 px : classe `low-fx` sur `body`), `weak` (`weakGpu(probeRenderer(), cœurs)`, voir `render/gpu.ts`), le `WebGLRenderer` (anticrénelage seulement si `!coarse && !weak`, `NeutralToneMapping`, pixel ratio plafonné à 1,5) et `audio = new AudioEngine()`.
3. `boot()` (async) : pose un `div.loading` « Chargement des modèles… n/total » et attend `loadModels` (tous les `.glb`, en parallèle ; un échec retombe sur le modèle procédural, voir [rendu-modeles.md](rendu-modeles.md)). **Le détail du nouvel écran de chargement et de la préparation des shaders est dans [chargement-performances.md](chargement-performances.md)** ; ce fichier décrit le démarrage tel qu'il était à la rédaction (un simple compteur de modèles).
4. Deux chemins ensuite :
   - clé `sessionStorage` `village-lowpoly:autostart` (`AUTOSTART`) présente : on lance sans menu. Format `carte|continue` ou `carte|fresh|difficulté`. Posée par le changement de langue, l'import, « Recommencer » ; lue puis effacée.
   - sinon `showMenu` (`ui/ui.ts`) : « Reprendre mon village » (s'il existe une sauvegarde de la carte), trois cartes de mode (Bac à sable, Facile, Normal : elles lancent aussitôt une partie neuve, avec confirmation si elle écrase une sauvegarde), tutoriel, import, crédits, langue. Le sélecteur de carte n'apparaît que s'il y a plusieurs cartes ; il n'y en a qu'une (`MAPS` dans `world/mapgen.ts` : le Continent, id 3, 192 cases de côté).
5. `start(map, mode, seed?, difficulty?)` (une seule fois, garde `started`) : repli sur `CONTINENT` si la carte n'existe plus, retire `#menu`, **`setMapSize(taille)`** puis `syncChunks()`, puis `new Game(...)`.

## Règles du jeu
Sans objet ici (voir les fichiers de chaque système). Valeurs globales : carte du Continent de `N = 192` cases ; difficulté par défaut `DEFAULT_DIFFICULTY` (`sim/difficulty.ts`, voir [difficulte.md](difficulte.md)).

## Fonctionnement dans le code

### La classe `Game`
Constructeur (`main.ts`), dans l'ordre :
1. Lecture de la sauvegarde (`loadSlot`, seulement en mode `continue`) puis du monde (`fromJSON` + `addDefaultDecor`) ou `newWorld` ; `war.load(w.war)`. Voir [sauvegarde.md](sauvegarde.md).
2. Réglages : `{ ...loadSettings(), ...save.settings }` (les réglages de la sauvegarde l'emportent) appliqués à `time`, `audio`, qualité, routes auto, catastrophes, ressources illimitées.
3. Vues et sous-systèmes (voir tableau), branchement des rappels entre eux (`ignite`, `onNews`, `onBang`…), ajout des groupes à `scene`, `applyQuality()`.
4. `ToolController` (outils de construction, `cam.handler`), `UI`, `CommandUI`, `HomeButton`, `PortalChoice`, `KingdomStage`, rappels des expéditions et du passage d'âge (`sim.onAgeUp`).
5. `sim.recalc()`, vue initiale de la caméra, écouteurs (`resize`, clavier via `bindKeys`, `visibilitychange` et `pagehide` → `saveNow`, changement de langue → sauvegarde + rechargement), `Tutorial`, `WarTips`, premier message, puis `requestAnimationFrame(frame)`.

| Rôle | Champs (fichier) |
|---|---|
| Données | `world` (`world/world.ts`), `sim` (`sim/sim.ts`), `time` (`core/time.ts`), `war` (`sim/war.ts`), `expeditions`, `railway`, `under` (`world/underground.ts`) |
| Terrain et décor | `terrain` (`render/terrainView.ts`), `veg`, `roads`, `streams`, `gardens`, `pens`, `seeps`, `env` (ciel, soleil, ombres), `atmosphere`, `eruptions` |
| Bâtiments | `buildings` (`render/buildings.ts`), `halos`, `upBadges`, `fires`, `emergencies`, `portalView`, `blightView` |
| Vie | `agents` (habitants), `patrols`/`sentinels` + leurs vues, `fauna`, `life`, `traffic`, `helis`, `airships`, `transports`, `fairground`, `zoo`, `alpine`, `railView`, `railBoost`, `fest`, `parade`, `trophies` |
| Expéditions et guerre | `expView`, `spaceCast`, `kingStage`, `command` (contrôle des troupes), `hellMode` (créé à la première visite), `isleLayer`, `ferry`, `isleRuins` (créés dans `stepWar`) |
| Entrées et interface | `cam` (`CameraRig`), `tools` (`build/tools.ts`), `ui`, `tutorial`, `warTips`, `portalChoice`, `homeBtn`, `audio` |

`Game` implémente `UIHost` (interface définie dans `ui/ui.ts`) : l'interface ne connaît le jeu que par elle.

### Modes de vue
`mode: 'surface' | 'under' | 'hell'` plus le drapeau `isleCmd`. Chaque mode a sa scène, son gestionnaire d'entrées (`cam.handler`) et ses bornes de caméra.

| Mode | Scène rendue | `cam.handler` | Bornes caméra |
|---|---|---|---|
| surface | `scene` | `tools` | zoom `minDist` 3,2 à `maxDist` ; limites `[2, N-2]` |
| surface + `isleCmd` | `scene` | `command` (théâtre de l'île) | idem ; la vue va sur l'île, `tiltTo(0.8)` |
| hell | `hellMode.scene` | `command` (théâtre des Enfers) | zoom 2,4 à 34, `minPitch` 0,28, limites `bounds` = carte des Enfers (`W` × `L`) |
| under | `underView.scene` | `underInput` | zoom 2,4 à 24, `minPitch` 0,95 |

Le mode **souterrain** n'est plus accessible au joueur (retiré du jeu) ; le moteur reste pour les Enfers et `__game.enterUnder(case)`. La descente automatique quand une troupe suivie est sous terre (`isBelow`, dans `frame`) ne devrait plus se produire (à vérifier).

Transitions :
- `enterHell()` : refuse si `war.hellWhy()` ; `fadeThrough` (fond noir 380 ms, charge `hellMode.ts` à la volée, mémorise `surfaceView` et `surfaceZoom`, passe `mode='hell'`, classes `under hell` sur `body`, `cam.jump`, `command.setTheater`).
- `exitHell()` : l'inverse, rend la vue de surface mémorisée.
- `commandIsle()` / `leaveIsle()` : pas de fondu, la vue reste en surface ; `command.setTheater(isleTheater())`. Depuis les Enfers, `commandIsle` remonte d'abord.
- `exitUnder()` sert aussi à quitter les Enfers (le bouton « Remonter »).
- `fadeThrough(fn, label)` : une seule bascule à la fois (garde `fading`) ; le voile se lève après deux images ou au plus 600 ms (onglet caché).
- `ensureSurface(then, keepIsle?)` : file `SurfaceGate` (`core/surface.ts`). Toute action du village demandée depuis les Enfers ou le commandement (suivre une équipe, aller au volcan, prendre un outil, tracer une ligne, `goHome`…) passe par elle : elle quitte la vue, attend `SURFACE_DELAY` (900 ms) puis exécute chaque action une fois, dans l'ordre ; abandon après 8 essais. `tools.setTool` est surchargé dans le constructeur pour cela.

### Boucle de jeu (`Game.frame`)
`dt = min(0,1 ; temps réel écoulé)` en secondes ; `gdt = time.update(dt)` : le temps **de jeu**, `dt × vitesse`, ou 0 en pause (vitesse jusqu'à ×8 : `gdt` monte à 0,8). Règle : ce qui est visuel et continu (caméra, eau, nuages, particules, UI) prend `dt` ; ce qui est simulé (besoins, habitants, expéditions, incendies, guerre, trains) prend `gdt`, donc s'arrête en pause.

Ordre (surface, simplifié) :
1. `adapt(temps brut)` (qualité « Auto »), `stepWind`, `time.update`, `cam.update(dt, hauteur du sol du mode)`, tremblement de caméra (éruption, secousse, cris du roi : `kingStage.shake`), `tools.update`.
2. Reconstructions limitées en fréquence : relief (`terrainTimer` 0,06 s), routes, bâtiments, végétation, jardins, halos (`propsTimer` 0,12 s), repousse de la lave (toutes les 2 s de jeu), teinte de la lave (0,25 s), saison (`refreshSeason`, clé = `seasonT × 120`), `roads.step`, `terrain.stepRecolor`.
3. `env.update`, `atmosphere.update` (pas aux Enfers ni sous terre), `sim.update(gdt, dt)`, éruptions, incendies, `wakeVolcano`, messages des incendies, urgences et pertes (`world.losses`).
4. Habitants (`agents.update`), patrouilles, sentinelles, `expeditions.update`, `holdIsle`, `stepWar` (guerre, alertes, île, `kingStage.update`), `stepFarewell`, `stepKingCrowd`, `railway.update`, `expView.update`, fêtes, enclos.
5. Suivi par la caméra d'une équipe d'expédition (`following`), puis **selon le mode** : Enfers (`command.frame`, `hellMode.update`), souterrain (`uv.update`), sinon animation de la surface (bâtiments, faune, eau, vie, trafic, portail, contamination, rails, jardins, halos, végétation). La surface n'est donc **pas animée** pendant qu'on est aux Enfers, mais la simulation (étapes 3 et 4) continue.
6. `audio.update`, minuterie de l'interface (toutes les 0,25 s : `ui.update`, `tutorial.update`, `command.render`, `warTips.update`, bouton « Retourner au village »), trophées (0,5 s), **sauvegarde automatique toutes les 15 s**, `renderer_render` (ombres une image sur `gfx.shadowEvery` si la vue est immobile ; halo `Glow` la nuit ou aux Enfers).

### Temps de jeu (`GameTime`)
- `hour` (0–24, départ 9), `days`, `seasonT` (0 à 4 : 0 printemps, 1 été, 2 automne, 3 hiver ; départ 0,15), `speed` (1), `paused`.
- `dayLen` = secondes **réelles** par jour (défaut 100, curseur 30–400) ; `seasonLen` = secondes réelles par saison (défaut 160, curseur 30–600). Un an = 4 × `seasonLen`.
- Les heures de nuit passent plus vite que celles du jour : `hour += g·24/dayLen / (1 + NIGHT_SKIP·sin((hour−6)/24·2π))`, `NIGHT_SKIP = 0,6` (environ 70 % du cycle au jour). Le jour garde sa durée totale `dayLen`.
- `mix()` : transition du décor d'une saison à la suivante sur `BLEND = 0,3` de saison, centrée sur le changement (la saison affichée est toujours celle qui domine). `setSeason(i)` pose `seasonT = i + 0,3`.
- Vitesses : bouton `#bSpeed` du HUD en boucle sur 1, 2, 4, 8 ; fenêtre Réglages : Pause, ×1, ×2, ×4, ×8. `Espace` bascule la pause (surface, souterrain, Enfers). Les réglages `dayLen`, `seasonLen`, `speed` sont sauvegardés ; `paused` et `days` ne le sont pas.
- Aux vitesses élevées : `cam.pace = speed`, la caméra qui suit rattrape d'autant plus vite ; les balayages de teinte du sol s'espacent (`refreshSeason`, `2 × max(1, speed)` crans).

### Caméra (`CameraRig`)
Orbitale : `target` (point visé), `yaw`, `pitch`, `dist`. Chaque valeur a un **but** (`goal`) et la valeur courante le rattrape (`1 − exp(−10·dt)` ; suivi : `1 − exp(−24·pace·dt)` pendant 0,3 s après chaque `follow`).
- Souris : clic gauche = outil courant ; clic droit glissé = tourner (`yaw −= dx·0,006`, `pitch += dy·0,005`, borné `[minPitch, 1,5]`), + Maj = déplacer ; clic milieu = déplacer ; molette = zoom vers le curseur (`exp(delta·0,0012)`) ; clic droit sans glisser (< 6 px) = ordre aux troupes (`rightClick`).
- Clavier (touches **physiques** `e.code`, donc ZQSD en AZERTY et WASD en QWERTY) : flèches ou WASD = déplacer ; Q/E = tourner (1,4 rad/s) ; Page haut/bas = incliner ; `+` / `−` = zoomer. Ignoré avec Ctrl, Méta ou Alt, et dans un champ de saisie.
- Tactile : un doigt = outil ; deux doigts = pincer (zoom), tourner, déplacer (`startGesture`, mode `gesture` annule l'outil en cours).
- Méthodes utiles : `goTo(x, z, dist)` (glisse, lâche le suivi), `follow(x, z, dist?, lift?)` (suit un point), `glide`, `jump(vue, y)` (saute sans glissement), `reset()` (vue d'ensemble : `homeDist()`, tient compte du ratio d'écran), `view()`, `tiltTo`, `panBy`, `bounds`.
- Distances : `maxDistFor() = 150·(N/48)·0,8` (480 pour N = 192), `homeFor() = 62·(N/48)·0,8`. Champ de vision 38°, plans 0,5 (rapproché de près) à 1 800. La caméra ne passe pas sous le sol (`groundY + 1,5`).
- Filet de sécurité : si `goal` ou la position devient non finie (NaN), la vue revient à la dernière vue valable (`sane`).
- **Une seule chose suivie à la fois** : équipe d'expédition (`following`), train (`trainCam`), incident (`incidentCam`). Chaque `follow…` lâche les autres ; faire glisser la vue (`onPan`) lâche tout. `goHome()` ramène sur le cœur du village (médiane des bâtiments, `villageCenter`), une seconde fois sur la vue d'ensemble.

### Raccourcis clavier (surface, `bindKeys`)
| Touche | Effet |
|---|---|
| `0`–`9` (rangée du haut ou pavé) | outils : 0 montagne, 1 relever, 2 abaisser, 3 aplanir, 4 falaise, 5 creuser, 6 forêt, 7 champ, 8 jardin, 9 gomme |
| `R` | route (si l'outil est déjà pris : bascule tracé en ligne / libre) ; avec un bâtiment en main ou sélectionné : le tourne |
| `X` démolir, `M` déplacer, `B` bâtir (dernier bâtiment) | |
| `T` | tourner le bâtiment en main |
| `Espace` | pause |
| `V` ou `Origine` | « Retourner au village » |
| `P` / `H` | mode photo (cache l'interface) ; `Échap` le quitte |
| `[` `]` | taille du pinceau (1 à 8, pas de 0,5) |
| `Ctrl+Z`, `Ctrl+Maj+Z` / `Ctrl+Y` | annuler, rétablir |
| `Échap` | ferme la fenêtre du dessus (`ui.closeTop`), sinon lâche l'outil ; annule le tracé d'une ligne |
| `Entrée` | valide le tracé d'une ligne de train |

En commandement (Enfers, île) `CommandUI.key` passe d'abord : `H` tenir, `R` retraite, `A` attaquer, `1`–`5` groupes (Ctrl ou Maj = enregistrer), `Espace` pause, `Échap` désélectionne (il ne quitte pas les Enfers). Aux Enfers, une touche d'outil du village (B, R, X, chiffres) remonte à la surface puis prend l'outil. Sous terre : `U` ou `Échap` remonte.

### Audio
`audio/audio.ts` : `AudioEngine`, tout en Web Audio, **procédural** (musique générative selon l'âge et la saison, ambiances, effets `sfx…`). Coupé par défaut (`muteMusic`, `muteSfx` vrais jusqu'à ce que le joueur les allume) ; le contexte démarre au premier clic ou à la première touche (`unlock`). `audio.update(dt, état)` reçoit chaque image l'âge, la saison, la lumière, la météo, la population, la distance de caméra et la proximité (torrents, côte, feu).

### Carte des dossiers
- `src/main.ts`, `src/hellMode.ts`, `src/kingdomStage.ts`, `src/kingdomEnd.ts` : démarrage, mode des Enfers, mise en scène du royaume.
- `src/core/` : temps, caméra, remontée en surface, hasard seedé.
- `src/world/` : l'état du monde et sa génération (`world.ts`, `mapgen.ts`, `continent.ts`, `hell.ts`, `portal.ts`, `blight.ts`, `terraform.ts`, `underground.ts`).
- `src/sim/` : règles et simulation (`sim.ts`, `economy.ts`, `expeditions.ts`, `missions.ts`, `war.ts`, `army.ts`, `hell.ts`, `railway.ts`, `agents.ts`…).
- `src/build/` : catalogue (`catalog.ts`), outils, placement, routes, remparts.
- `src/render/` : tout ce qui se dessine (voir [rendu-modeles.md](rendu-modeles.md)).
- `src/ui/` : interface (voir [interface.md](interface.md)).
- `src/save/save.ts` : voir [sauvegarde.md](sauvegarde.md). `src/i18n/` : voir [traduction.md](traduction.md). `src/audio/` : audio.
- `tests/` (vitest, un fichier par sujet), `public/models/` (modèles `.glb`), `assets-src/`, `tools/bench/`, `docs/` (ce manuel).
- Build : `vite.config.ts` (`base: './'`, `three` en morceau à part, tests hors `.claude/`), `wrangler.jsonc` (le dossier `dist/` servi tel quel par Cloudflare Workers, repli « application d'une page », aucun code serveur).

### `window.__game`
L'objet `Game` entier, pour préparer une situation à la main : `__game.world`, `.sim`, `.time`, `.cam`, `.war`, `.expeditions`, `.ui`, `.tools`. Méthodes de développeur : `enterHell()`, `enterUnder(case)`, `playKingdomEnd()`, `erupt(case)`, `saveNow()`. Ne pas s'en servir pour juger l'équilibre. Dans la console aussi : `i18nMissing()`, `setLang('en')` (voir [traduction.md](traduction.md)).

## Liens avec les autres systèmes
- Chaque système a son `update(gdt|dt)` appelé dans `frame` : voir son fichier pour ses règles.
- Le passage d'âge (`sim.onAgeUp`) est branché dans le constructeur : bannière, fenêtre des nouveaux bâtiments, couleur du sol des jardins.
- Les nouvelles de guerre (`war.news`) sont triées dans `stepWar` ; celles des incendies, urgences et pertes dans `frame`.

## Pièges et invariants
- **`N` est une variable de module** (`world/world.ts`) fixée par `setMapSize` : elle doit l'être avant tout `new World()`, vue ou caméra. Ne rien construire de dépendant de `N` à l'import.
- **`tr` est importé sous le nom `trx`** dans `main.ts` (des variables locales s'appellent `tr`). Le test de couverture des traductions ne voit donc pas les textes de `main.ts` (voir [traduction.md](traduction.md)).
- Avant tout `location.reload()`, mettre `running = false` (sinon `pagehide` ou la minuterie sauvegarderait un état à demi remis).
- La simulation continue aux Enfers ; la surface n'y est pas animée. Tout ce qui est ajouté dans la branche « surface » de `frame` est suspendu aux Enfers : si cela doit continuer, le mettre avant.
- Les actions du village faites depuis les Enfers doivent passer par `ensureSurface`, sinon elles s'exécutent avec la mauvaise scène.
- `fadeThrough` ignore un appel pendant un fondu : ne pas enchaîner deux bascules sans passer par `ensureSurface`.
- Le temps réel plafonné à 0,1 s : sous 10 images par seconde le jeu ralentit au lieu de sauter. Les pauses ne figent pas la caméra ni l'eau (`dt`).
- `days` (jours écoulés, affiché à l'écran de victoire) n'est pas sauvegardé : il repart de 0 à chaque chargement. À corriger si on s'en sert ailleurs.

## Pour modifier
- **Ajouter un sous-système animé** : classe dans `src/render/` ou `src/sim/` ; champ de `Game` ; construction dans le constructeur (après `world`) ; `scene.add(x.group)` dans la longue ligne d'ajout ; `x.update(…)` dans `frame` (branche surface si c'est un décor ; avant pour une simulation) ; s'il dépend de la qualité, le régler dans `applyQuality`.
- **Ajouter un réglage persistant** : voir la recette de [sauvegarde.md](sauvegarde.md) et un bouton dans `openSettings` ([interface.md](interface.md)).
- **Ajouter un raccourci** : `bindKeys` (surface) ; aux Enfers et en commandement, `CommandUI.key` ; éviter les touches de la caméra (`KeyW A S D Q E`, flèches, `+`, `−`, Page haut/bas, lues par `e.code`).
- **Ajouter un mode ou une vue** : suivre le schéma d'`enterHell` (`fadeThrough`, mémoriser `surfaceView`, `cam.bounds` et zoom, `cam.handler`, classe sur `body`) et d'`exitHell` ; brancher la scène dans `renderer_render` et le cas dans `frame` ; passer par `SurfaceGate` pour les actions du village.
