# Tutoriel

> Fichiers : `src/ui/tutorial.ts` (la bulle, la suite principale, l'état enregistré, le moteur des chapitres), `src/ui/tutorialChapters.ts` (les chapitres de l'île du portail, des Enfers et de l'archipel, et les textes de tous), `src/ui/tutorialRail.ts` (le chapitre de la première ligne de train), `src/ui/portalChoice.ts` (la carte du choix PvE), `src/main.ts` (création, déclencheurs, messages sans tutoriel), `src/style.css` (bloc « Tutoriel guidé »), `src/i18n/en/tutorial.ts` (anglais)
> Tests : `tests/tutoriel.test.ts`, `tests/bulleTutoriel.test.ts`, `tests/tutorielChapitres.test.ts`, `tests/guidePremiereLigne.test.ts`, `tests/invasion.test.ts` (le tutoriel ne lit pas le PvE)
> Voir aussi : [interface.md](interface.md), [portail-ile.md](portail-ile.md), [enfers.md](enfers.md), [armee-combat.md](armee-combat.md), [sauvegarde.md](sauvegarde.md), [traduction.md](traduction.md)

## En bref
Une bulle guide le joueur pas à pas. Elle se place à côté de l'élément dont elle parle, qu'entoure un anneau doré.
Chaque étape a des tâches ; quand elles sont faites, la bulle dit « Bien joué ! » puis passe seule à la suivante.
Rien n'est bloqué : « Suivant » passe toujours, « Passer le tutoriel » le met de côté.
Un « Suivant » qui arrive moins de 0,9 s après un passage automatique (`LATE_MS`), ou enfoncé sur l'étape d'avant (`downOn`),
est ignoré : il visait l'étape qui vient de se cocher et sautait la suivante (étapes 4 et 6 jamais vues, testeur v6).
Quand la bulle change de place à ce passage, un appui à son ancienne place, dans les 2,5 s (`GONE_MS`, rectangle gardé dans
`wasAt`), est avalé avant d'atteindre la carte (écouteurs en capture sur `window`) : le « Suivant » visé tombait sur le sol, et
aux Enfers il désélectionnait les troupes (testeur, 26 nov. 2026).
Plus tard dans la partie, des chapitres courts se lancent sur un événement : la première entrée dans les Enfers, le choix
de l'allié, la première ligne de train. Ils ne se montrent qu'une fois.

## Règles du jeu
- **Activation** (`startsOn`) : chaque **nouvelle partie** (hors bac à sable) relance la suite principale depuis la première
  étape, même si le joueur l'a finie ou passée dans une autre partie (« Passer » ne vaut que pour la partie en cours). Seule
  exception : il l'a désactivée par l'interrupteur de l'accueil (`menuToggle`, champ `off` de l'état, gardé d'une partie à
  l'autre). Une partie reprise garde son état (sans état enregistré : pas de tutoriel). Avant, une partie neuve ne le relançait
  que si l'état disait « en cours » : un joueur qui l'avait fini ou passé une fois ne le revoyait plus, l'interrupteur étant
  rangé dans les options de l'accueil. La ligne « Tutoriel » de Paramètres › Divers (`settingsHtml`) le reprend en cours de partie.
- **Nouvelle partie** : la suite principale repart de la première étape et le temps est en pause jusqu'au feu de camp.
  Avec la cinématique d'ouverture ([ouverture.md](ouverture.md)), la bulle attend cachée sous elle (`body.cinematic`), puis
  viennent le choix des contrôles et le blason : « Bienvenue ! » se lit une fois la vue posée sur la place à venir.
  Rien n'est en main pendant « Bienvenue » et « Regardez autour de vous » (`Tutorial.looking`) : le feu de camp passe en main
  au début de l'étape `fire`. Avant, il l'était dès le chargement, et le glissé demandé à l'étape 2 le posait (testeurs v6).
- **La suite principale** (10 étapes, dans `Tutorial` › constructeur ; 14 jusqu'au 17 nov. 2026, l'auteur la trouvait longue) :
  1. `welcome` « Bienvenue ! » (à lire)
  2. `camera` « Regardez autour de vous » : souris, et clavier (voir plus bas)
  3. `fire`, 4. `habitat` : poser feu de camp, puis maison et puits
  5. `food` « La production » : séchoir, bûcheron et pierrier, dans la même étape (une tâche chacun)
  6. `road` : prendre l'outil Route et tracer une route
  7. `time` : pause et vitesse
  8. `ages` « Les âges » : ouvrir les conditions de l'âge suivant (`#agePanel`), puis cliquer une expédition de la liste
      (l'anneau entoure la première ligne `[data-m]` pas encore remplie) : son clic ouvre la fenêtre des expéditions sur sa
      carte, où l'étape suivante reprend. Elle était « à lire » : un « OK » la passait sans ouvrir la liste, et les joueurs
      ne passaient plus par ce menu (retour de joueur, 22 nov. 2026). Ouverte une fois, la liste compte même refermée
      (`base.agesOpen`).
  9. `gear` « L'équipement » (à lire) : ouvrir l'onglet Équipement des expéditions et fabriquer la pièce de la mission
      que montre l'étape suivante (`tutoGear` : contre le premier danger de « La grande cueillette » en forêt, une lance à la
      Préhistoire) ; l'équipe emporte le meilleur de la réserve. Sans pièce possible, n'importe quelle pièce compte.
      La tâche nomme la pièce (« Fabriquer : Lance », `craftTask`) et la bulle la montre même quand elle n'est pas encore
      fabricable (la note dit pourquoi, le titre du bouton) : avant, elle montrait alors la première pièce venue, une torche
      inutile (v6).
  10. `expeditions` : ouvrir les expéditions (la fenêtre restée sur l'onglet Équipement : l'onglet des missions) et lancer
      une mission ; pas de suivi à l'œil, l'étape passe dès le départ. Pièce encore en fabrication, fenêtre de départ
      ouverte : une ligne invite à l'attendre. Départ impossible (« Lancer l'expédition » grisé : habitants libres,
      équipement), la ligne `blocked` le dit et propose de terminer ; la phrase nomme le vrai bouton, « Lancer l'expédition »
      (elle disait « Partir »).
- **Reprise** : une partie s'enregistre avec l'identifiant de l'étape (`id`). Arrêtée sur une étape retirée le 17 nov. 2026 (`MERGED` de `stepIndex`) : `wood` et `stone` reprennent à `food`, `resources` à `road`, `needs` à `time`. Arrêtée sur `gear`, elle reprend sur `gear`
  puis `expeditions` ; arrêtée sur `expeditions` (avant que l'équipement passe devant), elle reprend sur `expeditions`.
  Arrêtée sur `incidents`, l'ancienne 15e étape (retirée), le tutoriel compte pour fini (`retired`).
- **Verrous de construction** (`GATE`) : pendant les étapes 1 à 5, on ne bâtit que ce que le tutoriel a déjà fait poser
  (`welcome`, `camera`, `fire` : la place ; puis maison et puits ; puis séchoir, bûcheron et pierrier). Le reste dit « Le
  tutoriel vous le fera bâtir un peu plus tard. ». Le verrou saute dès que le village compte un bâtiment hors de `GUIDED`,
  et quand le tutoriel est fini ou mis de côté. Pas de verrou pendant un chapitre.
- **Clavier de la caméra** : le jeu lit les touches physiques (`camera.ts` : W A S D, Q E). La bulle suit les contrôles choisis
  au premier lancement (`host.controls`, voir [interface.md](interface.md)) : au clavier, les lettres de la disposition choisie
  (`layoutKeys` : Z Q S D et A / E en AZERTY, W A S D et Q / E en QWERTY) ; à la souris, la phrase du bord de l'écran et du
  glissé (`camera.mouse`). `viewKeys` (lettres lues de `getLayoutMap`) reste pour les tests. Au doigt, la phrase tactile seule.
- **Les fenêtres des expéditions pendant la bulle** (`hudTheme.css`, `body:has(#tuto:not([hidden]))`, écrans de 1 200 px et
  plus) : elles se rangent à gauche et laissent à la bulle (390 px) la colonne de droite, mais prennent tout le reste de
  l'écran (`calc(100vw - 440px)`, jusqu'à 1 500 px de large et 1 000 de haut ; la fenêtre de départ jusqu'à 1 180 px).
  Plafonnées à 1 100 px, elles restaient toutes petites sur un grand écran, une bande vide entre elles et la bulle (retour
  de joueur, 22 nov. 2026). La liste des missions passe sur une colonne jusqu'à 1 360 px.
- **La barre du bas pendant le tutoriel** : dans l'écran allégé (dès 1 100 px de large, voir [interface.md](interface.md)), les
  vignettes de construction se replient tant qu'aucun outil n'est en main, sauf pendant que la bulle guide (`tutorial.active`,
  lu par `UI.syncFold`) : la suite principale et les chapitres trouvent toujours rayons et vignettes ouverts. Les ancres ne
  changent pas : `#modes`, `#quickL` et `#quickR` passent sur la même bande que les rayons (`#dockTop`), avec leurs
  identifiants. Une vignette montrée (`.tHi`) garde le panneau ouvert. La boussole des expéditions (`#bExp`), que
  montrent les étapes `gear` et `expeditions`, garde son bouton ; seuls Peuples, Enfers et la cloche passent dans le menu
  `#bMenu`, qu'aucune étape ne montre. L'étape `time` montre `#timePanel`, qui contient désormais pause et vitesse.
- **Fin** : « Terminer » à la dernière étape. Le temps encore en pause repart à vitesse ×1. Le tutoriel reste dans les réglages (« Recommencer »).
- **Chapitre « Affronter les démons »** (`pve`) : **plus lancé** depuis le passage direct (22 nov. 2026, décision de l'auteur :
  le choix « Les Enfers » joue la cinématique et mène tout droit aux Enfers, voir [enfers.md](enfers.md)). Le code reste
  (`Game.pveStart` ne l'appelle que si `War.direct` est faux, c'est-à-dire jamais en jeu). Ce qu'il faisait (3 étapes depuis le 17 nov. 2026 : plus d'invasion, plus de tour de garde), lancé par le bouton « Affronter les démons » de la carte du
  portail. La vue va alors au commandement de l'île, menu ouvert sur « Bâtir » :
  1. `pveDefenses` « La caserne de l'île » : poser une caserne **sur l'île**. Une caserne posée au village pendant l'étape
     ne compte pas, et une ligne le dit. Hors de l'île, la bulle propose « Aller sur l'île ».
  2. `pveRecruit` : recruter un soldat (onglet « Recruter » de « Ma garnison »).
  3. `pveSend` « Aux Enfers » : choisir des soldats (« Tous »), puis « Envoyer aux Enfers » (`sent` de l'hôte : soldats
     passés ou en marche vers l'arche). Remplace « Vos ordres » et « L'invasion » ; un chapitre enregistré plus loin reprend
     à sa dernière étape.
- **Chapitre « Les Enfers »** (`hell`, 8 étapes), à la première entrée dans les Enfers (à la fin de la cinématique du portail). Se passe (« Passer ce chapitre »), ne se montre qu'une fois, la bulle à côté de ce qu'elle montre. Les gestes attendent d'être faits (24 nov. 2026, demande de l'auteur : il manquait comment déplacer les troupes et où attaquer) :
  1. `hellGoal` « Où attaquer » : l'anneau entoure le 🎯 à l'écran (`#hellGoal.show .hgPin`, ou sa flèche au bord quand la cible est hors de vue ; sinon l'objectif de la frise) ; cliquer l'objectif au bout de la frise centre la vue.
  2. `hellPick` « Vos troupes » : clic sur une troupe, cadre glissé, ou « Tous » (`selected` > 0).
  3. `hellMove` « Se déplacer » : un clic droit, une marche en formation (`lastOrder` neuf, de tout genre : un clic au sol près d'un démon devient une attaque, et la case ne se cochait jamais, testeur du 26 nov. 2026). La bulle se tient à l'écart ; sans troupe choisie, elle redit comment choisir.
  4. `hellAttack` « À l'attaque » : un clic droit sur la cible (`lastOrder` neuf de genre `attack`).
  5. `hellRetreat` « Revenir au camp » : la touche R replie les troupes choisies au camp (`Command.retreats`, compté seulement avec des troupes choisies).
  6. `hellCamp` « Le camp de base » (à lire, 22 nov. 2026) : le camp offert au Seuil, où les troupes se soignent ; « Bâtir » pose les autres bâtiments autour. L'anneau entoure l'onglet Bâtir.
  7. `hellRecruit` « Des renforts » (à lire) : d'autres troupes se recrutent ici, onglet « Recruter » de « Ma base » (la caserne avancée offerte à l'arrivée) ; l'anneau entoure l'onglet.
  8. `hellBack` (à lire) : « Village », ou un clic sur le portail, ramène au village.
- **Chapitre « L'or des voisins »** (`arch`, 4 étapes), lancé 3,2 s après le choix de l'allié, le temps de la bannière « Une alliance ! » : `Game.watchAlly` (`main.ts`, à chaque pas de `stepDiplo`) voit `world.diplo.ally` changer pendant la session, quelle que soit la carte qui l'a fait choisir ; une partie chargée avec son allié déjà choisi ne le relance pas :
  1. `archHome` « Relier les deux îles » : le but d'emblée (« reliez vos îles : un port chez vous, puis un port chez eux »), avec deux tâches, le port de l'île principale et celui de l'île alliée ; l'étape passe avec le premier (`need: 1`). Déjà bâti : elle passe.
  2. `archAllyHarbor` « Un port chez l'allié » : la vue va sur l'île de l'allié (`Game.goAlly`, le lobe le plus loin de la ville), sauf en pleine pose (`handsBusy` du `ChapterHost` : le bouton « Aller sur l'île alliée » y mène) ; un port sur sa côte, hors de sa ville. Ailleurs, la bulle propose « Aller sur l'île alliée ».
  3. `archPost` « Le comptoir » : un comptoir (`tradepost`) sur l'île de l'allié, près du port (les routes automatiques les relient). Le port s'ouvre à l'Antiquité, le comptoir seulement au Médiéval (choix de l'auteur, 20 nov. 2026) : encore à l'Antiquité, l'étape le dit (« Le comptoir s'ouvre au Médiéval… ») et ne montre pas la vignette, grisée.
  Aux étapes 1 à 3, la bulle montre l'onglet Bâtir, le rayon Production, puis la vignette ; une vignette cachée hors de la rangée qui défile (le port, le comptoir, au bout du rayon) : la flèche › (ou ‹), et une ligne dit « Cliquez sur la flèche › pour faire venir « Port », puis sur sa vignette. ». Le surlignage passe à la vignette dès qu'elle est visible. C'est `UI.buildAnchor(genre)` (`ui.ts`), qui sert à tout tutoriel qui fait poser un bâtiment.
  4. `archGold` « L'or » (à lire) : l'or fait passer les âges (20, 50, 100 : lus dans `AGES[n].reqGold`), et un clic sur l'or ouvre le comptoir pour vendre bois, pierre ou minerai. La bulle montre l'or de la barre des stocks.
  Il s'achève si l'archipel ou l'allié manque (`live`), se cache hors de la surface (`away`). Toute bulle se tait pendant la bataille de l'archipel (`body.rivalWar`, dans `Tutorial.update`) : celle-ci couvrait son bandeau.
- **Chapitre « La première ligne »** (`rail`, 6 étapes, 24 nov. 2026 : l'auteur trouvait l'outil des lignes trop compliqué pour qui le découvre ; voir [chemin-de-fer.md](chemin-de-fer.md)). `Game.watchRail` le lance une fois (`railWanted`) : âge industriel, village sans ligne qui a sa briqueterie (ou une gare), à la surface, sans fenêtre ouverte ni autre chapitre. Une partie qui a déjà une ligne ne le voit pas. Chaque étape attend son geste :
  1. `railTerminal` « La gare centrale » : poser la gare centrale (la vignette montrée par `UI.buildAnchor` ; sans briqueterie, c'est elle qui est montrée ; la note dit les briques qui manquent, puis la pose en deux clics quand la gare est en main).
  2. `railStation` « Une deuxième gare » : poser une petite gare. Déjà bâties, les étapes 1 et 2 passent d'elles-mêmes.
  3. `railOpen` « L'outil des lignes » : la vue va sur la gare centrale, marquée d'or (`#railPin`, que l'anneau entoure) ; sa fiche ouverte, l'anneau passe à « Nouvelle ligne ». Le bâtiment encore en main rentre.
  4. `railPick` « Les gares à relier » : le marqueur passe à la gare suivante, la vue cadre les deux. Tracé refermé : « Reprendre le tracé ».
  5. `railTrack` « La voie » : l'anneau entoure « Valider » ; voie rouge : la note propose « Tracé auto ».
  6. `railTrain` « Le premier train » (à lire) : la vue suit le train, la tâche se coche quand il part ; « Terminer ».
  Bloqué 12 s sur les étapes 3 et 4 (`STUCK_MS`), ou voie rouge à l'étape 5 : « Relier pour moi » prépare la ligne entre les deux gares les plus proches et saute à l'étape 5 (`Tutorial.jump`), où la bulle dit que le jeu a choisi. Il se lance même le tutoriel passé (`ALWAYS`), pas s'il est désactivé à l'accueil. Rejoué par « Me guider pas à pas » de l'onglet Chemin de fer (`Tutorial.replay` : même vu, même le tutoriel mis de côté ; rejoué avec une ligne déjà là, l'étape 5 attend une ligne de plus). Pendant le tracé, la bulle évite le panneau `#railEdit`.
- **Quand les chapitres se lancent** : une seule fois chacun, même le tutoriel fini, même s'il est en cours (la suite
  principale reprend après le chapitre). Jamais si le joueur a mis le tutoriel de côté (« Passer le tutoriel », ou
  désactivé à l'accueil ou dans les réglages). Sauf « L'or des voisins » (`ALWAYS`, `chapterDue`) : un mécanisme neuf que le joueur ne connaît pas ; il ne se tait que si le tutoriel est désactivé à l'accueil (`off`). « Passer ce chapitre » ne passe que le chapitre. « Recommencer » les réarme.
- **Sans tutoriel**, au temps de la garnison de l'île (avant le passage direct ; ces messages se taisent quand `War.direct`), la règle des défenses sur l'île était dite trois fois :
  - la carte du portail : « Pour les affronter : « Tour de garde » et « Caserne » sur l'île du portail, pas au village… » ;
  - à l'arrivée sur l'île sans ses défenses (`Game.commandIsle`) : menu sur « Bâtir » et un message, une fois par session ;
  - une tour de garde ou une caserne posée au village quand l'île n'en a pas : un message qui mène à l'île.

## Fonctionnement dans le code
- **Création** : `Game` (constructeur, `main.ts`) fait `new Tutorial(ui, game, fresh)`, puis `tutorial.setChapters(chapters(...))`
  avec un `ChapterHost` (défenses de l'île et du village, armée, sélection, dernier ordre, mode, commandement de l'île).
- **Boucle** : `Tutorial.update` est appelé quatre fois par seconde (`Game.frame`, avec `ui.update`). Il coche les tâches
  (`Step.check`, une tâche faite le reste), passe à l'étape suivante une seconde après, cache la bulle quand une fenêtre
  (`.overlay`) est ouverte, puis `render` (HTML refait seulement si la clé change) et `place`.
- **Une étape** (`Step`) : `anchor()` (l'élément montré, ou null : la bulle à une place fixe), `check()`, et en option
  `begin`, `text`, `more` (ligne HTML : les touches), `note`, `tasks`, `act` (un bouton dans la bulle), `bare` (l'élément ne
  sert qu'à placer la bulle : fiche du besoin, conditions d'âge), `read` (attend « OK »), `need`. Les textes d'une étape
  principale viennent de `TUTO_TEXT.steps[id]` ; ceux d'un chapitre, de `Step.t` (`CHAPTER_TEXT`).
- **Placement** (`Tutorial.place`, choix par `bestSpot`) : « à côté, jamais dessus » (choix de l'auteur après la vague v6, où
  la bulle cachait le village, les conditions de l'âge, la fiche du bâtiment, l'équipement à fabriquer, les onglets du bas). Les
  places possibles : les quatre côtés de l'élément montré (ou de toute sa carte, `.gear`, `.mission`, `.sCard` : son image et
  son nom restent visibles), et quatre places fixes (sous le HUD à droite et à gauche, au-dessus de la barre du bas à gauche et
  à droite). Chacune est notée : couvrir l'élément coûte très cher ; puis les panneaux ouverts (fiches, conditions de l'âge,
  fenêtres `.overlay > .modal`), les blocs du HUD, ceux de la barre du bas pris un par un (`DOCK` : ses colonnes se défont en
  `display: contents` selon la largeur), et, sans fenêtre ouverte, le milieu de l'écran où la caméra pose le village (poids 0,7) ;
  à égalité, la plus proche de l'élément. Sans élément montré, une des places fixes. La pointe ne paraît que sur un côté de
  l'élément.
- **L'anneau** suit l'élément à chaque image (`follow`, `requestAnimationFrame`), sans glissement : recalé quatre fois par
  seconde et glissant en 0,25 s, il restait à côté du liseré du bouton pendant que le carrousel défilait (deux cadres décalés,
  testeurs v6). Les cadres « à côté de leur cible » venaient aussi de la barre du haut qui changeait de disposition (voir
  [interface.md](interface.md)).
- **Vignette hors de la rangée** (`Tutorial.target`, pour toutes les étapes, chapitres compris) : une ancre `#items [data-kind]`
  cachée hors de la partie visible du carrousel est remplacée par la flèche qui la fait paraître (`#itNext` ou `#itPrev`,
  si elle n'est pas grisée), et la note de la bulle dit « Cliquez sur la flèche › pour faire paraître « … », puis sur le
  bâtiment. » (`TUTO_TEXT.scroll`, avant la note de l'étape). Une fois la vignette visible, elle redevient l'élément montré.
- **Surbrillance** : `#tutoRing`, un élément à part, entoure l'élément montré : bordure dorée, lueur qui respire en 3,2 s.
  L'élément lui-même prend la classe `.tHi` : sur un bouton, un liseré doré intérieur ; rien d'autre (ni `transform`, ni
  couleur de fond, ni animation).
- **Clics repérés** : un écouteur en capture sur `ui.root` note l'action de tout bouton
  à `data-a` (`goal` pour l'objectif de la frise) ; `Tutorial.clicked(a)`. La liste se vide à chaque étape.
- **Les drapeaux** : `on` (la bulle est active), `guiding` (la suite principale est en cours, même interrompue),
  `active` (la bulle guide vraiment : un chapitre qui attend ailleurs ne compte pas), `chapterOn`.
  `active` fait taire le conseil du moment (`UI.renderMessage`) et les aides militaires (`WarTips`, `busy`) ; pendant la suite principale (`on && guiding`), pas de petits objectifs (`Game.goalsOn`, voir [objectifs.md](objectifs.md)) ;
  `guiding` rend les expéditions indulgentes (`expeditions.lenient`).
- **Chapitres** : `Tutorial.chapter(id)` lance un chapitre si `chapterDue` l'accepte ; un autre chapitre en cours compte
  pour vu. `next` au bout, ou « Passer ce chapitre » : `endChapter` (vu, `onChapterEnd`, la suite principale reprend ou la
  bulle se cache). `Chapter.live()` faux l'achève aussi (Enfers quittés, portail refermé) ; `Chapter.away()` vrai le cache
  sans l'achever (le chapitre de l'île hors de la surface).
- **Déclencheurs** (`main.ts`) : au passage direct, `Game.pveStart` entre dans les Enfers (cinématique la première fois), et le chapitre `hell` vient à l'arrivée (`portalArrived`). Avant : « Les Enfers » du grand choix (`Game.openHell`, voir [grand-choix.md](grand-choix.md)), ou `PortalChoice` « fight » → `acceptPve`, → `Game.pveStart` (`tutorial.chapter('pve')`, puis
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
- **Couleurs** : ne pas teinter le fond d'un bouton montré ; certains ont un texte blanc.
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
- **Rejouer un chapitre à la demande** : `Tutorial.replay(id)` (le retire de `seen` et l'ouvre au début) ; aller à une étape du chapitre en cours : `Tutorial.jump(idÉtape)`.
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
