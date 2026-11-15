# Les îles rivales : l'allié, la paix ou la guerre

> Fichiers : `src/sim/diplomacy.ts` (état `DiploState`, règles, crochet `bindPostReady`, condition de l'Industriel, conflit en décor `conflictState`), `src/sim/rivalBattle.ts` (la bataille : `RivalMap`, `RivalBattle`, objectifs, défenseurs), `src/world/archipelago.ts` (place des îles, `People`), `src/world/rivalTown.ts` (`TownPlan.points` : plage, remparts, portes, port, palais), `src/sim/missions.ts` (missions `truce` et `allywar`, effet `diplo`, champ `talks`), `src/sim/events.ts` (imprévus de la diplomatie, `EventCtx.own`), `src/sim/expeditions.ts` (`list`, `why`, `chance` des pourparlers, tribut dans `mineStep`), `src/sim/sim.ts` (ligne de condition, `messageConflict`, `beforeAdvance`), `src/ui/diploChoice.ts` (cartes de l'allié et du dénouement, blasons `crest`), `src/ui/command.ts` (théâtre `rival` : la barre de la bataille), `src/render/battleUnits.ts` (`people` : les soldats du peuple rival), `src/ui/ui.ts` (condition cliquable `reqOf` → `conflict`), `src/main.ts` (`onIslesRevealed`, `onAllyChosen`, `stepDiplo`, `choosePath`, `diploLine`, `openDiploChoice`, `playPeace`, `startRivalBattle`, `stepRivalBattle`, `endRivalBattle`, `sim.beforeAdvance`), `src/world/world.ts` (`diplo`, règle du cosmodrome dans `canPlace`), `src/build/catalog.ts` et `src/render/models.ts` (monument de la concorde `concord`).
> Tests : `tests/diplomatie.test.ts`, `tests/batailleArchipel.test.ts` (la bataille), `tests/expeditionsBornees.test.ts` (chaque expédition se joue jusqu'au bout).
> Voir aussi : [iles.md](iles.md) (les îles et les villes de décor), [grand-choix.md](grand-choix.md) (« Explorer le monde » et la cinématique), [portail-ile.md](portail-ile.md) et [armee-combat.md](armee-combat.md) (le moteur de combat), [expeditions.md](expeditions.md), [ages.md](ages.md), [fin-de-partie.md](fin-de-partie.md), [sauvegarde.md](sauvegarde.md), [traduction.md](traduction.md).

## En bref
Quand le joueur choisit « Explorer le monde », la carte s'agrandit et deux îles rivales apparaissent, celle des **Sablais** (style oriental, `orient`) et celle des **Jadéens** (style asiatique, `asie`), en guerre l'une contre l'autre. **À la fin de la cinématique**, une carte fait choisir **l'allié** (obligatoire, définitif). **Au Médiéval**, une fois un port et un comptoir installés chez l'allié, une carte propose de régler le conflit : **la paix** (deux pourparlers sans échec possible, les émissaires puis l'ambassade, puis une **cinématique de la paix**) ou **la guerre** (une expédition militaire qui débarque nos troupes, puis une **bataille jouée** sur l'île rivale). **Le conflit réglé est une condition du passage à l'Industriel.** Décisions de l'auteur (15 nov. 2026). Rien de ceci n'existe sans l'archipel. Le cosmodrome se pose chez l'allié.

## Règles du jeu

### L'archipel accepté
`archipelagoOn(w)` (`world/expand.ts`, réexportée par `diplomacy.ts`) = `!!w.isles`. C'est la seule question à poser (jamais la version du générateur). L'âge d'acceptation est `world.exploredAt`.

### Le choix de l'allié
- **À la fin de la cinématique** (`Game.onIslesRevealed`), la carte s'ouvre aussitôt (`DiploChoice.showAlly`) si aucun allié n'est choisi (`allyPending`). Sinon, au calme (`stepDiplo` : aucune fenêtre ni carte, ni fondu ni cinématique, `popups` ouverts), tant que l'allié manque (partie rechargée, ancienne partie).
- Les deux peuples côte à côte, blason (`crest`), île, mœurs. **Pas de croix**. `chooseAlly` : une seule fois ; les deux peuples deviennent « rencontrés » (`met`). Bannière « Une alliance ! ».
- **Crochet** : `Game.onAllyChosen?.(peuple)` juste après (tutoriel de l'archipel, construction chez l'allié) ; l'allié se lit aussi dans `world.diplo.ally`.

### Le dénouement (Médiéval)
- `endgameOpen(w, âge)` : un allié, le conflit `open`, **au Médiéval** (`ENDGAME_AGE` = 2), et le port et le comptoir installés chez l'allié (`allyPostReady(world)` de la session de l'or, branchée par `bindPostReady` ; tant qu'elle n'est pas branchée, le crochet répond oui). `endgameWhy` dit ce qui manque (le port et le comptoir, l'allié, l'âge).
- La **carte du dénouement** (`showPath`) s'ouvre d'elle-même une fois (`diplo.asked`, hors tutoriel), puis d'un clic sur la condition du panneau des âges, sur le conseil du moment, ou sur la ligne « ⚖️ Le conflit des deux îles » en tête du rayon Vie (`diploLine`). Pas de croix ; deux choix (`choosePath`), qu'on peut changer tant que la bataille n'est pas engagée (`battle` à `none`).
- **Négocier la paix** (`peace`) : **deux pourparlers** (`PEACE_CHAIN`, âge 2 ; décision de l'auteur : « on en fait que 2 »). Ce sont des **pourparlers** (`Mission.talks`) : `risk: 0`, `lose: []`, `chance` vaut 0, aucune option d'imprévu ne blesse, seuls leurs imprévus surviennent.
  - `envoys` « Les émissaires » (imprévus `mistrust`, `grievance`) : le **comptoir chez l'île rivale** s'ouvre (`diplo.post`, `rivalPost(w)`) ; le conflit dure encore.
  - `truce` « L'ambassade de la paix » (`PEACE_MISSION`, `requires.missions: ['envoys']` ; imprévus `grievance`, `seat`, `menu`, `music`) : le conflit passe à `peace` (**réglé**), la **fête** (`diplo.feast`), le **monument de la concorde** se débloque (`concord`, `reqMission: 'truce'`), et la **cinématique de la paix** est à jouer (`diplo.cine`).
- **La cinématique de la paix** (`Game.playPeace`, une fois, au calme) : la vue s'élève au-dessus du bras de mer (« La paix des deux îles · Les deux chefs ont signé, les flottes se saluent »), passe sur l'île rivale (son comptoir), sur l'île alliée, revient au village où la fête des trois peuples éclate (deux fêtes : feux d'artifice) et où le monument attend (« Un monument de la concorde à bâtir »). Environ 19 s. `cine` retombe dès qu'elle commence.
- **Aider notre allié** (`war`) : l'expédition militaire `allywar` « Aux côtés de notre allié » (`WAR_MISSION`, âge 2, avec troupe, onglet Militaires) : escorter la flotte alliée (risque 0,18) ou débarquer de nuit (0,32). Elle **peut échouer** et se **retente**. Réussie (effet `landing`) : les troupes sont à terre, `diplo.battle` = `ready`, et **la bataille commence** (au calme, `stepDiplo` → `startRivalBattle`).

### La bataille (voie de la guerre)
- **La carte** (`RivalMap`) : un rectangle autour de la ville rivale (plage, port, palais, remparts, plus 8 cases), la terre praticable (`cellAvg > −0,12` : le quai et la plage comptent), moins **les remparts** : chaque côté bloque, sauf autour du milieu d'un côté percé d'une porte (`TownPlan.gates`). On n'entre donc que par les portes.
- **Nos troupes** (`armyOf(âge)`) : 8 chevaliers (soldats avant le Médiéval) et 4 archers, à l'âge du village (`troopStats`), débarqués en grappe sur la plage. Point de repli : la plage.
- **Les objectifs**, dans l'ordre (`GOALS`) : **la plage** (défenseurs un peu en retrait, vers la ville), **les remparts** (la première porte, celle de la route du port), **le port** (le quai), **le palais**. Défenseurs (`GUARDS`) : 4 soldats et 2 archers, puis 4 et 3, 4 et 2, 5 et 3 (au palais, la garde : des chevaliers dès le Médiéval) ; leurs forces × `GUARD_K` = 0,9 de celles de nos troupes du même âge. Ce sont des unités du camp `hell` du moteur, sortes `soldier` et `archer`, gardes à leur poste (zone 0 : alerte, laisse de 16 cases, pas de renfort).
- Un objectif est **pris** quand ses défenseurs sont tombés et qu'une de nos troupes est à moins de `TAKE_R` = 4 cases ; bannière « La plage : pris ! · Objectif suivant : … », et toutes nos troupes reçoivent l'ordre d'attaquer le suivant. **Sans ordre**, une troupe marche d'elle-même sur l'objectif en cours (attaque d'un point : elle combat en route) : la bataille se joue aussi sans commander, et l'emporte de justesse (4 à 5 survivants sur 12, test).
- **La barre de bataille** (théâtre `rival` de `CommandUI`) : le bandeau de l'objectif (« Objectif 2/4 : les remparts · 7 défenseurs · 10 soldats »), les cartes des troupes et « Tous », la bulle d'aide, l'Aide et **« Retraite »**. Choisir (clic, cadre), envoyer (clic droit), comme sur l'île du portail. La vue va sur la plage, de trois quarts. Les défenseurs ont la tenue de leur peuple (`BattleLayer.people`, `peopleRole`).
- **Victoire** (le palais pris) : `claimVictory` (conflit `won`, **butin** `WAR_SPOILS.loot` = 60 or une fois), bannière « Victoire ! », fête au village ; puis le **tribut** de 2 or par jour de jeu (`tributePerDay`, versé par `Expeditions.mineStep`).
- **Défaite** (toutes nos troupes tombées, la retraite, ou `BATTLE_LIMIT` = 900 s) : `loseAllyBattle`, `battle` = `lost`, nouvel essai dans `RETRY_DAYS` = 2 jours ; un message mène alors à la bataille (ou la condition du panneau, ou la ligne du rayon Vie : « À la bataille »).
- **Pas de passage d'âge pendant la bataille** (`ageGate(Game.allyBattle)` dans `sim.beforeAdvance`). Rien n'est sauvegardé pendant : une partie rechargée recommence la bataille (`battle` reste `ready`).

### La condition de l'Industriel
- `conflictItem(w, next)` : avec l'archipel, le passage vers l'Industriel (âge 3) demande « le conflit des deux îles, réglé » (`CONFLICT_LABEL`, 0/1). `Sim.ageProgress` l'ajoute avant la fin d'âge ; tant qu'elle manque, `Sim.ready` est faux.
- Un clic sur la ligne (`reqOf` → `conflict`) ou sur le conseil (« Pour l'âge suivant : réglez le conflit des deux îles, par la paix ou par la guerre (cliquez ici) », `Sim.messageConflict`) passe par `Game.openDiploChoice` : la carte de l'allié s'il manque ; la bataille si elle est prête (ou le délai qui reste) ; sinon la carte du dénouement, ou ce qui l'empêche (`endgameWhy`).
- **Une partie déjà au-delà du Médiéval avec un conflit ouvert** (ancienne partie, archipel accepté tard) : le conflit est réputé réglé (`settleLate` : `treaty`, sans carte ni bannière). Décision de l'auteur : « on s'en fiche des anciens joueurs, le jeu est en bêta » ; seule compte la sauvegarde qui se relit.

### Le conflit en décor
`conflictState(w)` : `{ kind: 'war' }` tant qu'il est `open` (escarmouches), `peace` ou `treaty` (commerce), `{ kind: 'won', winner: allié }` (patrouilles), null sans archipel. `stepDiplo` le donne à `NavalConflict.state` quand il change.

### Le cosmodrome
`spaceportWhy` (dans `World.canPlace`) : sans archipel, l'île principale ; avec, l'île alliée seulement (les quatre coins, `onRival`). Seule pose permise hors de l'île principale. Voir [fin-de-partie.md](fin-de-partie.md).

## Fonctionnement dans le code
- `World.diplo` (`DiploState`) : `met`, `ally`, `path` (`peace`, `war` ou null), `conflict` (`open`, `peace`, `won`, `treaty`), `asked`, `post`, `feast`, `battle` (`none`, `ready`, `lost`), `retry` (heure `exp.clock` du nouvel essai), `cine`. Sauvegardé sous `world.diplo` seulement s'il a bougé (`saveDiplo`) ; relu par `readDiplo` (valeurs inconnues ignorées ; ancienne voie `neutral` → à rechoisir, carte rouverte ; `warned` oublié).
- Anciennes parties : `contact` et `feast` n'existent plus (`readExpState` oublie ces ids) ; `envoys` et `truce` gardent leur id. Les effets `meet` et `victory` restent lus.
- Les effets `diplo` passent par `applyEffects` → `applyDiplo` (`victory` → `claimVictory`). `redoEffects` les retire.
- `Expeditions.list` filtre par `missionOffered` ; `why` refuse par `missionWhy`.
- Le monument de la concorde (âge 2) n'apparaît que si `kindOffered` (archipel et voie de la paix, ou ambassade réussie).
- Noms : `peopleName`, `isleName` (« les Sablais », « l'île des Sables » ; « les Jadéens », « l'île de Jade »), traduits.

## Liens avec les autres systèmes
- [grand-choix.md](grand-choix.md) : la cinématique, à la fin de laquelle s'ouvre la carte de l'allié.
- [portail-ile.md](portail-ile.md), [armee-combat.md](armee-combat.md) : le moteur `Hell`, la barre de commandement (`CommandUI`), `BattleLayer`.
- [iles.md](iles.md) : `TownPlan.points` et les remparts de la ville rivale.
- [expeditions.md](expeditions.md), [ages.md](ages.md), [fin-de-partie.md](fin-de-partie.md).
- Autres chantiers : l'or et la construction chez l'allié (`allyPostReady` à brancher par `bindPostReady`, lisent `onAllyChosen` / `diplo.ally`, `rivalPost`, `tributePerDay`, `WAR_SPOILS`) ; le conflit naval (`conflictState`).

## Pièges et invariants
- **Le crochet `bindPostReady`** n'est pas encore branché (la fonction d'or-comptoir est sur une autre branche) : la carte du dénouement vient dès l'allié choisi. À la fusion : `bindPostReady(allyPostReady)` au démarrage de `Game`.
- **La ville rivale n'est que du décor** : ses maisons ne bloquent pas le passage au combat (seuls les remparts). Les bâtiments ne changent pas d'état pendant la bataille (les états `ruin` / `repair` de `townRuins.ts` attendent l'après-guerre).
- La barre `rival` est une branche à part de `CommandUI.render` (ni garnison, ni base, ni portail) ; `escapeAction` n'y quitte rien.
- **Construire hors de l'île principale** : seul le cosmodrome, chez l'allié ; sans routes chez lui, les équipes spatiales n'ont pas de chemin jusqu'à lui.
- Les imprévus de la diplomatie n'ont pas de mise en scène (`stageEvent`).
- La cinématique de la paix est une suite de mouvements de caméra et de bannières (`setTimeout`), pas la mise en scène des cinématiques du grand choix (`voyageStage.ts`) : à reprendre avec elle si l'on veut des navires qui se saluent.

## Pour modifier
- **Changer la chaîne de pourparlers** : les missions (`talks: true`, âge 2, `requires.missions` en chaîne) et leurs ids dans `PEACE_CHAIN` ; répartir les effets `post`, `truce`, `feast` (`truce` règle le conflit et lance la cinématique).
- **Équilibrer la bataille** : `ARMY`, `GUARDS`, `GUARD_K`, `TAKE_R` (`rivalBattle.ts`) ; `tests/batailleArchipel.test.ts` (l'armée sans ordre doit gagner, avec des pertes).
- **Brancher le port et le comptoir** : `bindPostReady`. **Changer la condition** : `conflictItem`, `CONFLICT_LABEL`, `settleLate`.
