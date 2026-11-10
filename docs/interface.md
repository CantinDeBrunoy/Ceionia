# Interface

> Fichiers : `src/ui/ui.ts` (classe `UI`, menu d'accueil, crédits, fenêtres génériques ; 2 200 lignes), `src/ui/notifs.ts` (file de messages, bannières), `src/ui/icons.ts` (icônes SVG), `src/ui/brief.ts` (textes courts des fiches), `src/ui/homeButton.ts` (« Retourner au village »), `src/style.css` (tout l'habillage), et, à part : `ui/command.ts` (barre des troupes), `ui/tutorial.ts`, `ui/warTips.ts`, `ui/portalChoice.ts`, `ui/kingdom.ts`, `ui/spaceViews.ts`, `ui/voyageArt.ts`, `ui/wallPlan.ts`
> Tests : `tests/notifications.test.ts`, `tests/fiche.test.ts`, `tests/menuIle.test.ts`, `tests/savedAgo.test.ts`, `tests/tutoriel.test.ts`, `tests/aidesMilitaires.test.ts`
> Voir aussi : [architecture.md](architecture.md), [traduction.md](traduction.md), [sauvegarde.md](sauvegarde.md), [tutoriel.md](tutoriel.md), [batiments-catalogue.md](batiments-catalogue.md), [besoins-population.md](besoins-population.md), [expeditions.md](expeditions.md), [armee-combat.md](armee-combat.md)

## En bref
L'interface est du **HTML posé sur le canevas** (`#ui`), construit une fois par `new UI(root, host)` en une grande chaîne de gabarit, puis mis à jour par petits morceaux. `UI` ne connaît le jeu que par l'interface `UIHost` (définie en tête de `ui.ts`, implémentée par `Game`). Rien n'est dessiné en WebGL ici. Tout texte passe par `tr()` ([traduction.md](traduction.md)) ; la page se recharge pour changer de langue, donc le HTML n'a pas à se redessiner de lui-même.

## Règles du jeu
- **HUD du haut** (`#hud`) : âge et jauge de progression avec la liste des conditions du prochain âge (un clic la déplie, un clic sur une condition prend le bâtiment qui manque ou ouvre la ressource, l'expédition, le chemin de fer) ; besoins (nourriture, eau, logement, travail, bien-être, santé, + sécurité qui n'est qu'un indicateur) ; compteur d'habitants (fiche de recensement) ; stocks (bois, pierre, minerai, puis briques, brut et carburant selon l'âge) avec leur production par jour ; conseil du moment ; horloge, pause, vitesse (×1, ×2, ×4, ×8), bouton du brouillard (visible quand `fogLevel() ≥ 0,15`) ; expéditions, cloche, mode photo, réglages.
- **Barre du bas** (`#dock`) : outils rapides (voir, route, démolir, déplacer), trois onglets (**Relief**, **Nature**, **Bâtir**), annuler / rétablir / tourner / revenir au village, vignettes, puis les rayons de construction (Habitat, Production, Services, Vie & culture, Militaire : `BUILD_CATS`) ou le pinceau. Un clic sur l'onglet déjà ouvert replie la barre (`body.dockMin`).
- **Village vide** : seule la place du village est constructible (`startLock.ts`, `isStart`) ; les autres onglets, rayons et outils sont grisés, la vignette de la place luit et l'outil « place » est déjà en main.
- **Vignettes** (`renderItems`) : les bâtiments de l'âge courant et de l'âge suivant seulement (`minAge ≤ âge + 1`, et pas au-delà de `maxAge`) ; les verrouillés sont rangés après les posables dans chaque groupe (`BUILD_SUBS`). Une vignette affiche le nombre déjà bâti ou un cadenas. Raisons d'un cadenas (`lockOf`) : âge, « trop tard » (`maxAge`), place du village d'abord, tutoriel, expédition à réussir (`reqMission`), bâtiment à avoir d'abord (`reqKind`).
- **Messages** (`NotifQueue`, `notifs.ts`) : 4 niveaux `action` (3), `danger` (2), `notice` (1), `info` (0). Seuls les trois premiers font un message à l'écran ; `info` va seulement dans la cloche. Jamais plus de `max` messages visibles : 2, ou 1 sur écran étroit (≤ 600 px) ou pendant une bannière. Durée `durationOf` : de 3 à 5 s selon la longueur (`2200 + 40·longueur`), au moins 6,5 s s'il mène quelque part. Le même texte en moins de `DEDUP_MS` = 10 s n'est pas redit (« ×3 »). Historique de `HISTORY_MAX` = 30 messages, dans la cloche (`#notifPanel`). Un message qui attend plus de `WAIT_MAX_MS` = 8 s n'est plus montré à l'écran. Pendant une fenêtre ouverte, les messages automatiques attendent et sortent groupés à la fermeture.
- **Bannières** (`Banners`) : titre court de `BANNER_MS` = 3,2 s ; avec une clé `once`, seulement la première fois (clé gardée dans `ceionia.bannieres`) ; retenue pendant une fenêtre.
- **Conseil du moment** (`#msg`, `renderMessage`) : texte de `sim.message` ; orange (manque), bleu (avancer vers l'âge), vert (tout va bien) ; un clic prend le bâtiment cité, ouvre les expéditions, trace une ligne ou passe l'âge. Dès l'Antiquité (âge ≥ 1) il se cache sauf besoin à combler ou passage d'âge prêt, tant que le joueur n'a pas allumé `#helpBtn`. Caché pendant le tutoriel guidé et pendant le commandement des troupes.
- **Mode photo** : `P` ou `H` (ou bouton), `Échap` pour sortir ; `body.photo` cache `#hud`, `#dock`, `#expList`, `#selCard` et montre `#photoBar` (Capturer : `Game.capture()` rend une image et télécharge `village-{date}.png`).
- **« Retourner au village »** (`HomeButton`, `#homeBack`) : paraît quand la grande place sort de l'écran (marge 1,05 en coordonnées d'écran, 0,9 une fois affiché) ou que le point visé en est loin (plus de `max(14, 0,75 × distance caméra)` cases, ×0,8 une fois affiché). Évalué à chaque tick de l'interface, en surface seulement.

## Fonctionnement dans le code

### Identifiants du DOM à connaître
`#hud` (`#agePanel`, `#needsPanel` avec `#needs`, `#res`, `#msg`, `#helpBtn`, `#timePanel` avec `#clock`, `#bPause`, `#bSpeed`, `#bFog`, `#menuBtns`), `#expList` (cartes des équipes et des incidents), `#selCard`, `#railEdit`, `#dock` (`#info`, `#dockMain` : `#quickL`, `#modes`, `#quickR`, `#items`, `#subcats`, `#biomes`, `#roadModes`, `#brush`), `#toasts`, `#notifPanel`, `#bannerWrap`, `#photoBar`, `#fade`, `#cursorHint`, `#census`, `#needInfo`, `#homeBack`. Les tests (`menuIle.test.ts`) et le tutoriel s'appuient sur certains : ne pas les renommer sans chercher leurs usages.

### Cycle de mise à jour
`UI.update()` est appelée par `Game.frame` toutes les 0,25 s (minuterie `uiTimer`) et à la main après un changement (outil, âge, expédition…). Elle ne reconstruit **que ce qui a changé** : chaque morceau garde une clé et compare (`dataset.v` pour l'horloge, le compteur d'habitants, l'âge ; `tilesKey` pour les vignettes ; `resKey` pour les stocks ; `selKey` pour la fiche d'un bâtiment ; `railKey`, `notifKey`, `#msg` `dataset.v`). **Tout état affiché dans un de ces morceaux doit entrer dans sa clé**, sinon il reste périmé. En plus : `tickNotifs` toutes les 250 ms (minuterie propre à `UI`).

### Sous-ensembles de `ui.ts`
- En tête : `UIHost` ; tables statiques en français (`TOOL_INFO`, `TOOL_DESC`, `TABS`, `QUICK`, `NEEDS`, `GIVES`, `RES_META`, `NEED_RULE`, `BIOME_CHOICES`, `ROAD_MODES`, `GARDEN_BY_AGE`, `UNLOCK_NOTE`) traduites **à l'affichage** (`toolInfo`, `tr(…)`) ; petites aides (`attr`, `num`, `pct`, `ic`, `hex`, `folded`, `railStat`).
- Fenêtres génériques : `modal(root, classe, titre, corps, onClose?, sticky?)`, `confirmBox(root, message, ok)` (promesse), `chooseDifficulty(root, options)` (trois cartes), `langPicker` / `bindLangPicker`.
- `class UI` : constructeur (gabarit HTML, écouteurs des boutons) ; barre du bas (`renderDock`, `renderItems`, `refreshTools`, `markFirst`, `bindTools`, `pick`, `lockOf`) ; fiches (`renderInfo`, `renderSelection`, `renderRailEdit`, `toolInfo`) ; HUD (`update`, `renderMessage`, `renderResources`, recensement `census` / `renderCensus`, fiches de besoin et de ressource `openNeed` / `openRes` / `renderNeed` / `renderRes` / `renderSecurity`) ; messages (`toast`, `info`, `banner`, `tickNotifs`, `renderNotifs`, `toggleNotifPanel`) ; expéditions (`updateExpeditions`, `openExpeditions` avec ses onglets Missions, Équipement, Chemin de fer, `openSend`, `showDecision`, `showReport`, `expEvent`, `gotoMission`) ; `showNewAge` ; `openSettings`.
- Après la classe : `showMenu` (accueil), `showCredits`, `drawPreview`, le paysage SVG de l'accueil.

### Fiches
- **Au survol d'une vignette** (`renderInfo`, `#info`) : nom de l'âge, taille, nombre déjà bâti, description, effets (`GIVES`), conseil, coût en bois et pierre (`priceIn`, rouge si l'on n'a pas de quoi), cadenas. **Bâtiment en main** : même fiche réduite (`.held`), avec la raison d'un refus de pose (`tools.placeWhy`) ou « R : tourner · Échap : lâcher ».
- **Bâtiment sélectionné** (`renderSelection`, `#selCard`) : nom, âge, taille ; description et conseil repliés (`brief`, `folded`) ; lignes d'état propres à la sorte (habitants d'une maison, bêtes d'un enclos, briques, pétrole, raffinerie, voitures, contamination de l'île) ; pour une gare, les lignes de train (suivre, modifier, fermer, voyageurs / marchandises) ; boutons d'amélioration (`UPGRADES`, avec coût ou ce qui manque) et la case à cocher des flèches d'amélioration (même réglage que Réglages › Partie) ; Commander la garnison (tour de garde, caserne) ; Déplacer, Tourner (`R`), Démolir. La carte garde l'état des `<details>` ouverts et le défilement d'un rendu à l'autre.
- **Besoins et ressources** : un clic sur l'icône d'un besoin ou d'un stock ouvre `#needInfo` (combien il en faut, d'où il vient, quoi bâtir ; pour la sécurité, une couverture à surligner sur la carte) ; un clic sur le compteur ouvre `#census`. Un clic ailleurs les ferme.
- `brief(texte, max = 120)` coupe un texte en un début court (première phrase, sinon un morceau coupé à `:`, `;`, `,`) et sa suite ; `shortStop(nom)` raccourcit un nom de gare (« Gare intermodale » → « Intermodale », « Gare à grande vitesse 2 » → « GV 2 »).

### Fenêtres (`overlay`)
Toute fenêtre est un `div.overlay` dans `#ui` qui porte une méthode `close`. `UI.closeTop()` ferme la dernière : elle est appelée par `Échap` (`bindKeys`) ; elle ignore `#menu` et `.victory`. Une fenêtre **non sticky** se ferme aussi d'un clic sur le fond ; une fenêtre `sticky` (décision d'une expédition) ne se ferme que par sa propre réponse. Une fenêtre ouverte retient les messages automatiques (`tickNotifs` regarde `.overlay`), met en pause la file des conseils (`warTips.busy`) et peut mettre le jeu en pause (la fenêtre de décision le fait elle-même). `#fade` (z-index 30) est le voile noir de `Game.fadeThrough`.

### Réglages (`openSettings`)
Trois onglets : **Temps et météo** (vitesse Pause/×1/×2/×4/×8 ; durée du jour 30–400 s et de la saison 30–600 s ; saison et heure ; météo Auto / Clair / Pluie / Neige / Brume), **Image et son** (graphismes Auto / Haute / Normale / Réduite ; musique et sons : volume + coupure), **Partie** (difficulté en lecture seule ; catastrophes ; routes auto ; flèches d'amélioration ; ressources illimitées, verrouillé par la difficulté, un second clic confirme ; Sauvegarder / Exporter / Importer ; tutoriel ; langue ; Crédits, Recommencer, Menu principal). Chaque réglage passe par une méthode de l'hôte (`setQuality`, `setDisasters`, `setAutoRoads`, `setHideUpBadges`) ou par `applySettings()`, qui sauvegarde les réglages ([sauvegarde.md](sauvegarde.md)). La fenêtre se met à jour toute seule tant qu'elle est ouverte (toutes les 500 ms : vitesse, saison, heure).

### Menu d'accueil (`showMenu`)
Titre, résumé de la partie existante (mode, âge, population, « sauvegardé il y a… » via `savedAgo`), trois cartes de difficulté (`DIFF_TEXT`) qui lancent la partie, interrupteur du tutoriel (`menuToggle`), langue, import, crédits, rappel des commandes. Redessiné à chaud quand la langue change.

### Icônes (`icons.ts`)
`ic(nom, taille = 20, trait = 1.8)` rend un SVG au trait (couleur du texte) d'après la table `P` (nom → éléments SVG). `KIND_ICON` (une icône par sorte de bâtiment, vérifiée par le type `Record<KindId, string>` : un bâtiment sans icône ne compile pas), `CAT_ICON` (rayons), `SUB_ICON` (groupes), `SEASON_ICONS`. Les icônes remplacent les emoji, dont le rendu varie ; quelques emoji restent dans des textes.

## Liens avec les autres systèmes
- `Sim` fournit le conseil (`message`, `messageKind`, `messageExp`, `messageIsle`, `messageRail`), la progression d'âge (`ageProgress`) et les compteurs (`counts`) : voir [besoins-population.md](besoins-population.md), [ages.md](ages.md).
- Les expéditions (cartes `#expList`, fenêtre, décisions, récit) : [expeditions.md](expeditions.md). Les ordres aux troupes et la barre des troupes ne sont **pas** dans `ui.ts` : `ui/command.ts` ([armee-combat.md](armee-combat.md)).
- Le tutoriel (`tutorial.lock(k)` peut verrouiller une vignette) : [tutoriel.md](tutoriel.md). Les bulles du volet militaire (`WarTips`) : `ui/warTips.ts`.
- L'ensemble des textes français : voir le dictionnaire `src/i18n/en/ui.ts`.

## Pièges et invariants
- **Le bouton qui vient d'être cliqué perd le focus** (`root.addEventListener('click', … b.blur())`) : sinon `Espace` (pause) réactiverait le dernier bouton cliqué. Garder ce comportement pour les nouveaux boutons.
- Le HTML est construit par chaînes : tout texte venu des données doit passer par `attr()` (attributs) ou être échappé (`replace(/</g, '&lt;')`), comme `sim.message`. Les textes statiques traduits par `tr()` sont sûrs.
- Les clés de cache : la fiche d'un bâtiment se redessine seulement si `selKey` change ; les listes (`renderItems`) si `tilesNow()` change. Un état de plus à montrer = l'ajouter à la clé.
- `lockOf` est appelée pour chaque vignette à chaque tick de 0,25 s : la garder rapide.
- `Échap` ferme d'abord la fenêtre du dessus, ensuite seulement lâche l'outil : une nouvelle fenêtre doit porter `close` (via `modal`) pour être fermée ainsi.
- Une fenêtre de **récit** (`showReport`) n'est pas fermée par un clic à côté ni, sous terre, par `Échap` : on la lit puis on clique Fermer.
- La classification d'un message sans niveau se fait **par expressions régulières sur le texte** (`DANGER`, `INFO` dans `notifs.ts`, avec des mots français et anglais) : un message important dont le texte ressemble à `INFO` (« sauvegard… ») ne serait qu'une ligne de cloche. Passer le niveau explicitement (`toast(m, act, 'danger')`).
- Textes oubliés à traduire : voir les listes de `tests/i18nOublis.test.ts`. Le texte de `ui.banner('Monde souterrain', …)` n'est pas passé par `tr`.
- Les deux clés `ceionia.aides` (conseil du moment et bulles du volet militaire) n'ont pas le même défaut quand elle est absente : voir [sauvegarde.md](sauvegarde.md).
- Après un `refreshTools`, l'onglet et le rayon suivent l'outil en main (`tabOfTool`) : changer d'outil par programme change l'onglet affiché.

## Pour modifier
**Ajouter un bouton (HUD ou barre du bas)** : (1) dans le gabarit du constructeur de `UI`, avec `title` et `aria-label` passés par `tr()` ; (2) son `onclick` juste après (sinon dans `bindTools` pour un outil) ; (3) si cela touche au jeu, une méthode sur `UIHost` et son implémentation dans `Game` (`main.ts`) ; (4) le style dans `src/style.css` ; (5) l'entrée anglaise dans `src/i18n/en/ui.ts` ; (6) l'état du bouton (actif, grisé) dans `update` ou `refreshTools`, avec sa clé.

**Ajouter un outil** : entrée dans `TOOL_INFO` et `TOOL_DESC`, id dans la liste d'un onglet de `TABS` (ou une tuile dans `renderItems`), logique dans `build/tools.ts` (`ToolId`), raccourci éventuel dans `bindKeys` ([architecture.md](architecture.md)).

**Ajouter une fenêtre** : `const { ov, close } = modal(this.root, 'ma-classe', titre, corps, onClose?)` ; lier les boutons du `ov` (`$('.ok', ov).onclick = close`) ; styles `.overlay .ma-classe` ; pas besoin de gérer `Échap` ni le clic sur le fond. Une décision à ne pas écarter : `sticky = true`. Une confirmation : `confirmBox`.

**Ajouter une ligne à la fiche d'un bâtiment** : dans `renderSelection`, pousser une chaîne dans `stats` (elle fait partie de `selKey`) ; pour une action, un bouton `data-act="…"` et sa branche dans le gestionnaire en bas de la fonction.

**Ajouter un réglage** : bouton dans la section voulue d'`openSettings`, branche sur un champ de l'hôte, sauvegarde : voir la recette de [sauvegarde.md](sauvegarde.md).

**Ajouter une icône** : une entrée dans `P` (`icons.ts`), appelée par `ic('nom')` ; pour un nouveau bâtiment, `KIND_ICON`.
