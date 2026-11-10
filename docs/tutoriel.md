# Tutoriel

> Fichiers : `src/ui/tutorial.ts` (la bulle, la suite principale, l'état enregistré, le moteur des chapitres), `src/ui/tutorialChapters.ts` (les chapitres de l'île du portail et des Enfers), `src/ui/portalChoice.ts` (la carte du choix PvE), `src/main.ts` (création, déclencheurs, messages sans tutoriel), `src/style.css` (bloc « Tutoriel guidé »), `src/i18n/en/tutorial.ts` (anglais)
> Tests : `tests/tutoriel.test.ts`, `tests/tutorielChapitres.test.ts`, `tests/invasion.test.ts` (le tutoriel ne lit pas le PvE)
> Voir aussi : [interface.md](interface.md), [portail-ile.md](portail-ile.md), [enfers.md](enfers.md), [armee-combat.md](armee-combat.md), [sauvegarde.md](sauvegarde.md), [traduction.md](traduction.md)

## En bref
Une bulle guide le joueur pas à pas. Elle se place à côté de l'élément dont elle parle, qu'entoure un anneau doré.
Chaque étape a des tâches ; quand elles sont faites, la bulle dit « Bien joué ! » puis passe seule à la suivante.
Rien n'est bloqué : « Suivant » passe toujours, « Passer le tutoriel » le met de côté.
Plus tard dans la partie, des chapitres courts se lancent sur un événement : le choix d'affronter les démons, la première entrée
dans les Enfers. Ils ne se montrent qu'une fois.

## Règles du jeu
- **Activation** : d'office pour qui n'a encore aucune partie (`tutorialOn`). L'interrupteur de l'écran d'accueil
  (`menuToggle`) et la ligne « Tutoriel » de Réglages › Partie (`settingsHtml`) le changent ; le choix est retenu.
- **Nouvelle partie** : la suite principale repart de la première étape et le temps est en pause jusqu'au feu de camp.
- **La suite principale** (15 étapes, dans `Tutorial` › constructeur) :
  1. `welcome` « Bienvenue ! » (à lire)
  2. `camera` « Regardez autour de vous » : souris, et clavier (voir plus bas)
  3. `fire`, 4. `habitat`, 5. `food`, 6. `wood`, 7. `stone` : poser feu de camp, maison et puits, séchoir, bûcheron, pierrier
  8. `resources` « Les ressources » : la barre `#res` et à quoi servent bois, pierre, minerai (à lire)
  9. `road` : prendre l'outil Route et tracer une route
  10. `needs` : ouvrir la fiche d'un besoin
  11. `time` : pause et vitesse
  12. `ages` : ouvrir les conditions de l'âge suivant (à lire)
  13. `expeditions`, 14. `gear`, 15. `incidents`
- **Verrous de construction** (`GATE`) : pendant les étapes 1 à 7, on ne bâtit que ce que le tutoriel a déjà fait poser
  (`welcome`, `camera`, `fire` : la place ; puis maison et puits ; puis séchoir ; bûcheron ; pierrier). Le reste dit « Le
  tutoriel vous le fera bâtir un peu plus tard. ». Le verrou saute dès que le village compte un bâtiment hors de `GUIDED`,
  et quand le tutoriel est fini ou mis de côté. Pas de verrou pendant un chapitre.
- **Clavier de la caméra** : le jeu lit les touches physiques (`camera.ts` : W A S D, Q E). La bulle affiche les lettres de
  la disposition du joueur (`navigator.keyboard.getLayoutMap`, Chrome et Edge) ; sans elle, celles de la langue : Z Q S D et
  A / E en français, W A S D et Q / E en anglais (`viewKeys`). Au doigt, la phrase tactile seule.
- **Fin** : « Terminer » à la dernière étape. Le tutoriel reste dans les réglages (« Recommencer »).
- **Chapitre « Affronter les démons »** (`pve`, 4 étapes), lancé par le bouton « Affronter les démons » de la carte du
  portail. La vue va alors au commandement de l'île, menu ouvert sur « Bâtir » :
  1. `pveDefenses` : poser une tour de garde et une caserne **sur l'île**. Une défense posée au village pendant l'étape
     ne compte pas, et une ligne le dit. Hors de l'île, la bulle propose « Aller sur l'île ».
  2. `pveRecruit` : recruter un soldat (onglet « Recruter » de « Ma garnison »).
  3. `pveOrders` : choisir des soldats (« Tous ») et donner un ordre d'un clic droit.
  4. `pveInvasion` (à lire) : avec assez de soldats, « Affronter » lance l'invasion, qui ouvre les Enfers.
- **Chapitre « Les Enfers »** (`hell`, 4 étapes), à la première entrée dans les Enfers :
  1. `hellGoal` : le 🎯 marque le prochain bastion ; cliquer « Centrer ».
  2. `hellPick` : choisir des troupes (sans troupe : « Renforts » fait venir la garnison).
  3. `hellAttack` : un ordre d'un clic droit sur la cible (la bulle se tient à l'écart).
  4. `hellBack` (à lire) : « Retourner sur l'île » ramène au village.
- **Quand les chapitres se lancent** : une seule fois chacun, même le tutoriel fini, même s'il est en cours (la suite
  principale reprend après le chapitre). Jamais si le joueur a mis le tutoriel de côté (« Passer le tutoriel », ou
  désactivé à l'accueil ou dans les réglages). « Passer ce chapitre » ne passe que le chapitre. « Recommencer » les réarme.
- **Sans tutoriel**, la règle des défenses sur l'île est dite trois fois :
  - la carte du portail : « Pour les affronter : « Tour de garde » et « Caserne » sur l'île du portail, pas au village… » ;
  - à l'arrivée sur l'île sans ses défenses (`Game.commandIsle`) : menu sur « Bâtir » et un message, une fois par session ;
  - une tour de garde ou une caserne posée au village quand l'île n'en a pas : un message qui mène à l'île.

## Fonctionnement dans le code
- **Création** : `Game` (constructeur, `main.ts`) fait `new Tutorial(ui, game, fresh)`, puis `tutorial.setChapters(chapters(...))`
  avec un `ChapterHost` (défenses de l'île et du village, armée, sélection, dernier ordre, mode, commandement de l'île).
- **Boucle** : `Tutorial.update` est appelé quatre fois par seconde (`Game.frame`, avec `ui.update`). Il coche les tâches
  (`Step.check`, une tâche faite le reste), passe à l'étape suivante une seconde après, cache la bulle quand une fenêtre
  (`.overlay`) est ouverte, puis `render` (HTML refait seulement si la clé change) et `place`.
- **Une étape** (`Step`) : `anchor()` (l'élément montré, ou null : la bulle à droite sous le HUD), `check()`, et en option
  `begin`, `text`, `more` (ligne HTML : les touches), `note`, `tasks`, `act` (un bouton dans la bulle), `bare` (l'élément ne
  sert qu'à placer la bulle : fiche du besoin, conditions d'âge), `read` (attend « OK »), `need`. Les textes d'une étape
  principale viennent de `TUTO_TEXT.steps[id]` ; ceux d'un chapitre, de `Step.t` (`CHAPTER_TEXT`).
- **Placement** (`Tutorial.place`) : dessous si l'élément est en haut de l'écran, dessus s'il est en bas, sinon sur un côté ;
  sous tout le panneau du HUD, au-dessus du dock ; le côté qui cache le moins les fiches ouvertes ; la pointe vise le milieu.
- **Surbrillance** : `#tutoRing`, un élément à part, entoure l'élément montré : bordure dorée, lueur qui respire en 3,2 s.
  L'élément lui-même prend la classe `.tHi` : sur un bouton, un liseré doré intérieur ; rien d'autre (ni `transform`, ni
  couleur de fond, ni animation).
- **Clics repérés** : un écouteur en capture sur `ui.root` note l'œil des cartes (`exp`, `inc`) et l'action de tout bouton
  à `data-a` (`goal` pour « Centrer ») ; `Tutorial.clicked(a)`. La liste se vide à chaque étape.
- **Les drapeaux** : `on` (la bulle est active), `guiding` (la suite principale est en cours, même interrompue),
  `active` (la bulle guide vraiment : un chapitre qui attend ailleurs ne compte pas), `chapterOn`.
  `active` fait taire le conseil du moment (`UI.renderMessage`) et les aides militaires (`WarTips`, `busy`) ;
  `guiding` rend les expéditions indulgentes (`expeditions.lenient`).
- **Chapitres** : `Tutorial.chapter(id)` lance un chapitre si `chapterDue` l'accepte ; un autre chapitre en cours compte
  pour vu. `next` au bout, ou « Passer ce chapitre » : `endChapter` (vu, `onChapterEnd`, la suite principale reprend ou la
  bulle se cache). `Chapter.live()` faux l'achève aussi (Enfers quittés, portail refermé) ; `Chapter.away()` vrai le cache
  sans l'achever (le chapitre de l'île hors de la surface).
- **Déclencheurs** (`main.ts`) : `PortalChoice` « fight » → `acceptPve` → `Game.pveStart` (`tutorial.chapter('pve')`, puis
  `commandIsle`) ; `Game.enterHell`, une fois la vue posée → `tutorial.chapter('hell')`.
- **Après un chapitre fini** (`onChapterEnd`) : les aides militaires qui disaient la même chose sont marquées vues
  (`isle` et `orders` pour l'île, `hell` pour les Enfers).
- **Sans tutoriel** : `Game.commandIsle` → `CommandUI.isleMenu('build')` et `Game.isleBrief` ; `buildings.onPlaced` →
  `Game.defenseWhere`. Les deux se taisent quand le chapitre guide déjà (`tutorial.active`, `chapterOn === 'pve'`).

### L'état enregistré
Clé `village-lowpoly:v1:tutorial` du `localStorage`, lue par `parseState`, écrite par `Tutorial.save` à chaque changement :
- `on` : la suite principale est en cours ; `step` : son numéro ; `id` : l'identifiant de cette étape ;
- `end` : `'done'` (finie) ou `'skip'` (mise de côté) ; absent : en cours, ou ancien état ;
- `seen` : les chapitres déjà montrés ; `ch` : `{ id, step }` du chapitre en cours (il reprend au chargement d'une partie,
  pas dans une partie neuve).

## Liens avec les autres systèmes
- Interface : les ancres sont des sélecteurs du HUD, du dock, des fenêtres d'expédition et de la barre des troupes
  (`#troopBar`, voir `command.ts`). Un sélecteur renommé casse l'étape sans erreur : la bulle se met à l'écart.
- Construction : `UI.lockOf` demande `tutorial.lock(k)` (les verrous `GATE`).
- Guerre : le chapitre de l'île lit les défenses (`isleDefenses`), l'armée, `invasionNeed`, `Command.lastOrder` par le
  `ChapterHost`. Le tutoriel principal, lui, ne lit rien du PvE (facultatif).
- Aides militaires (`warTips.ts`) : muettes tant que la bulle est active ; celles qu'un chapitre a dites ne reviennent pas.

## Pièges et invariants
- Bac à sable : `new Tutorial(…, off = world.sandbox)` ne lit ni n'écrit l'état enregistré (le choix du joueur pour ses autres parties reste intact), et `chapter()` ne lance aucun chapitre (voir [bac-a-sable.md](bac-a-sable.md)).
- **`tutorial.ts` ne lit pas le PvE** : ni `war.`, ni `isleDefenses`, ni `hellWhy`, ni `invasion` (tests). Tout ce qui
  touche à la guerre passe par `tutorialChapters.ts` et le `ChapterHost`.
- **Compatibilité** : les anciens états n'ont que `on` et `step`. Finir et passer y écrivaient tous deux `on: false` ;
  `setAside` tranche : arrêté au-delà de la première étape, passé ; revenu à la première, fini (ou jamais commencé : les
  chapitres se montrent). Le numéro d'un ancien état se lit dans `LEGACY` (l'ordre d'avant « Les ressources ») : **ne
  jamais changer `LEGACY`**, ni l'identifiant d'une étape existante.
- **Une phrase courte par étape** : moins de 120 signes, pas de « . » au milieu (tests, chapitres compris).
- Dans un texte, `{nom}` devient une icône (`fmt` de `tutorial.ts`) : remplir `{tower}`, `{n}`… avant (`names` dans
  `tutorialChapters.ts`), sinon le texte affiche une icône vide.
- **Pas d'animation sur l'élément montré** : la barre des troupes refait son HTML chaque seconde (compte à rebours) ; une
  animation posée sur l'élément repartirait de zéro à chaque fois et clignoterait. La lueur vit sur `#tutoRing`.
- **Couleurs** : ne pas teinter le fond d'un bouton montré ; certains ont un texte blanc (« Retourner sur l'île »).
- « Passer » seul est déjà traduit « Advance » (passage d'âge) : le bouton des chapitres dit « Passer ce chapitre ».
- Le chapitre des Enfers s'achève dès qu'on les quitte (`live`), même au milieu : il ne se joue qu'à la première entrée.
- Onglet caché du navigateur : la boucle ralentit, la bulle met plusieurs secondes à passer. Rien de faux dans le jeu.

## Pour modifier
- **Ajouter une étape à la suite principale** :
  1. ses textes dans `TUTO_TEXT.steps` (`tutorial.ts`), à sa place dans l'ordre ;
  2. l'étape dans le tableau `this.steps` du constructeur (même position), avec `anchor` et `check` ;
  3. si c'est une pose de bâtiment : `make(id, [kinds])`, et `GATE` / `GUIDED` si le verrou doit la suivre ;
  4. l'anglais dans `src/i18n/en/tutorial.ts` ;
  5. la liste `IDS` de `tests/tutorielChapitres.test.ts`. Ne pas toucher `LEGACY`.
- **Ajouter un chapitre déclenché par un événement** :
  1. son identifiant dans `ChapterId` et `CHAPTERS` (`tutorial.ts`) ;
  2. ses textes dans `CHAPTER_TEXT` et ses étapes dans `chapters()` (`tutorialChapters.ts`), avec `live` / `away` ;
     ce qu'il doit lire de la partie s'ajoute au `ChapterHost` et à son objet dans `main.ts` ;
  3. l'appel `this.tutorial.chapter('<id>')` au moment de l'événement (`main.ts`), après que l'interface est en place ;
  4. au besoin, les aides militaires à marquer vues dans `onChapterEnd` ;
  5. l'anglais (`src/i18n/en/tutorial.ts`) et le compte de `chapterTexts()` dans le test.
- **Changer l'apparence** : le bloc « Tutoriel guidé » de `style.css` (`#tuto`, `#tutoRing`, `button.tHi`). Garder le
  halo sans `transform` et respecter `prefers-reduced-motion`.
- **Changer un texte** : le français dans `TUTO_TEXT` ou `CHAPTER_TEXT`, la clé anglaise correspondante dans le même commit.
