# Les îles rivales : l'allié et le conflit

> Fichiers : `src/sim/diplomacy.ts` (état `DiploState`, règles, condition du Moderne, crochets de la bataille et du conflit en décor `conflictState`), `src/world/archipelago.ts` (place des îles, `People`), `src/sim/missions.ts` (missions `envoys`, `truce`, `feast`, `allywar`, effet `diplo`, champ `talks`), `src/sim/events.ts` (imprévus de la diplomatie, `EventCtx.own`), `src/sim/expeditions.ts` (`list`, `why`, `chance` des pourparlers, tribut dans `mineStep`), `src/sim/sim.ts` (ligne de condition, `messageConflict`, `beforeAdvance`), `src/ui/diploChoice.ts` (cartes du choix de l'allié et du dénouement, blasons `crest`), `src/ui/ui.ts` (condition cliquable `reqOf` → `conflict`), `src/main.ts` (`onIslesRevealed`, `onAllyChosen`, `stepDiplo`, `choosePath`, `diploLine`, `openDiploChoice`, `sim.beforeAdvance`), `src/world/world.ts` (`diplo`, règle du cosmodrome dans `canPlace`), `src/build/catalog.ts` et `src/render/models.ts` (monument de la concorde `concord`).
> Tests : `tests/diplomatie.test.ts`, `tests/expeditionsBornees.test.ts` (chaque étape se joue jusqu'au bout).
> Voir aussi : [iles.md](iles.md) (les îles et les villes de décor), [grand-choix.md](grand-choix.md) (« Explorer le monde » et la cinématique), [expeditions.md](expeditions.md), [ages.md](ages.md), [fin-de-partie.md](fin-de-partie.md), [monde-carte.md](monde-carte.md), [portail-ile.md](portail-ile.md) (la carte du choix dont les nôtres reprennent le style), [sauvegarde.md](sauvegarde.md), [traduction.md](traduction.md).

## En bref
Quand le joueur choisit « Explorer le monde » (le grand choix de la fin de l'Antiquité, ou plus tard), la carte s'agrandit et deux îles rivales apparaissent, celle des **Sablais** (style oriental, `orient`) et celle des **Jadéens** (style asiatique, `asie`), en guerre l'une contre l'autre. **À la fin de la cinématique**, une carte fait choisir **l'allié** : obligatoire, définitif, sans croix. **Au début de l'Industriel**, une carte propose de régler le conflit : **la paix** (trois expéditions de pourparlers, sans échec possible) ou **la guerre** (une expédition militaire, qui peut échouer et se retenter, en attendant la grande bataille). **Le conflit réglé est une condition du passage au Moderne.** Plus de neutralité, plus de traité automatique (décisions de l'auteur, 15 nov. 2026, après une partie complète). Rien de ceci n'existe sans l'archipel. Le cosmodrome se pose chez l'allié.

## Règles du jeu

### L'archipel accepté
`archipelagoOn(w)` (`world/expand.ts`, réexportée par `diplomacy.ts`) = `!!w.isles` : la place des îles n'existe que dans une partie agrandie (ou née archipel). C'est la seule question à poser ; toute la diplomatie la lit (jamais la version du générateur). L'âge d'acceptation est `world.exploredAt`.

### Le choix de l'allié
- **À la fin de la cinématique** (`Game.onIslesRevealed`), la carte s'ouvre aussitôt (`DiploChoice.showAlly`) si aucun allié n'est choisi (`allyPending` = archipel et `!diplo.ally`).
- **Sinon, au calme** (`stepDiplo` : aucune fenêtre ni carte, ni fondu ni cinématique, `popups` ouverts) tant que l'allié manque : une partie rechargée avant de choisir, une ancienne partie à l'archipel sans allié (avec ou sans l'ancien premier contact).
- Les deux peuples côte à côte, avec leur blason (`crest`), leur île et leurs mœurs. **Pas de croix** : il faut choisir. `chooseAlly` : une seule fois ; les deux peuples deviennent « rencontrés » (`met`). Bannière « Une alliance ! ».
- **Crochet** : `Game.onAllyChosen?.(peuple)` est appelé juste après (pour le tutoriel de l'archipel et la construction chez l'allié, autres chantiers) ; l'allié se lit aussi à tout moment dans `world.diplo.ally`.
- L'expédition « Le premier contact » (`contact`) **n'existe plus**. Une ancienne partie qui l'avait réussie reste valable : l'id s'oublie (`readExpState`), `met` reste, et la carte s'ouvre si l'allié manque.

### Le dénouement (Industriel)
`endgameOpen(w, âge)` : archipel, allié choisi, conflit `open`, âge 3 (`ENDGAME_AGE`). La **carte du dénouement** (`showPath`) s'ouvre d'elle-même une fois (`diplo.asked`, hors tutoriel), puis d'un clic sur la condition du panneau des âges, sur le conseil du moment, ou sur la ligne « ⚖️ Le conflit des deux îles » en tête du rayon Vie (`diploLine`). Elle n'a pas de croix : deux choix (`choosePath`), qu'on peut changer tant que le conflit dure.
- **Négocier la paix** (`peace`) : ouvre la chaîne `PEACE_CHAIN` = `envoys` → `truce` → `feast` (âge 3, `requires.missions` en chaîne). Ce sont des **pourparlers** (`Mission.talks`) : `risk: 0`, `lose: []`, `chance` vaut 0 quoi qu'il arrive, aucune option d'imprévu ne blesse, et seuls les imprévus qui nomment la mission surviennent (`EventCtx.own`). Chaque étape réussie ne se refait pas (`missionWhy`). Récompenses :
  - `envoys` « Les émissaires » : le **comptoir chez l'île rivale** (`diplo.post`, lu par `rivalPost(w)`) ;
  - `truce` « La trêve des deux îles » : le conflit passe à `peace` (**réglé** : la condition du Moderne est remplie, les escarmouches cessent) et le **monument de la concorde** se débloque (`concord`, `reqMission: 'truce'`) ;
  - `feast` « La fête des trois peuples » : `diplo.feast`, bien-être durable, invités ramenés, deux fêtes au retour au lieu d'une.
- **Aider notre allié** (`war`) : l'expédition militaire `allywar` « Aux côtés de notre allié » (`WAR_MISSION`, âge 3, avec troupe, onglet Militaires) devient proposée. Deux choix, en mer : escorter la flotte alliée (risque 0,22) ou débarquer et prendre leur fort (0,38). Elle **peut échouer** (blessés) et se **retente**. Réussie (effet `{ t: 'diplo', act: 'victory' }` → `winAllyWar`) : le conflit passe à `won`, le **butin** (`WAR_SPOILS.loot` = 60 or) est versé une fois (`applyEffects`), puis le **tribut** (`WAR_SPOILS.tribute` = 2 or par jour de jeu, `tributePerDay`, versé par `Expeditions.mineStep`). Ses imprévus : `blockade`, `parley`. `startAllyBattle(w)` reste le crochet de la grande bataille à venir (il ne fait rien) ; s'il lançait une bataille, le toast qui mène à l'expédition ne s'afficherait pas.
- Le choix de la voie fait un toast qui mène à l'expédition à faire.

### La condition du Moderne
- `conflictItem(w, next)` : avec l'archipel, le passage vers le Moderne (âge 4) demande la ligne « le conflit des deux îles, réglé » (`CONFLICT_LABEL`, 0/1 ; remplie quand le conflit n'est plus `open`). `Sim.ageProgress` l'ajoute avant la fin d'âge ; tant qu'elle manque, `Sim.ready` est faux.
- Un clic sur la ligne (`reqOf` → `conflict`) ou sur le conseil du moment (« Pour l'âge suivant : réglez le conflit des deux îles, par la paix ou par la guerre (cliquez ici) », `Sim.messageConflict`) ouvre la carte (`Game.openDiploChoice` : celle de l'allié d'abord s'il manque). Même mécanique que le grand choix ([grand-choix.md](grand-choix.md)).
- **Une partie déjà au-delà de l'Industriel avec un conflit ouvert** (ancienne partie passée sans le régler, ou archipel accepté au Moderne) n'est jamais bloquée : `settleLate` le règle d'office (`treaty`) au premier pas, bannière « Le traité des deux îles ».
- **Pas de passage d'âge pendant une bataille** : `ageGate(Game.allyBattle)` dans `sim.beforeAdvance` (toujours faux tant que la bataille n'existe pas).

### Le conflit en décor
`conflictState(w)` donne l'état sous la forme du conflit naval vivant (`ConflictState` de `sim/navalConflict.ts`) : `{ kind: 'war' }` tant qu'il est `open` (escarmouches), `peace` ou `treaty` (commerce), `{ kind: 'won', winner: allié }` (patrouilles), null sans archipel. `stepDiplo` le donne à `NavalConflict.state` quand il change.

### Le cosmodrome
`spaceportWhy` (appelé par `World.canPlace` pour `spaceport`) : sans archipel, rien ne change (l'île principale) ; avec, il faut un allié et les quatre coins sur son île (`onRival` : l'union de ses lobes, à 3 cases près ; la terre est vérifiée par ailleurs). C'est la seule pose permise hors de l'île principale. Voir [fin-de-partie.md](fin-de-partie.md).

## Fonctionnement dans le code
- `World.diplo` (`DiploState`) : `met`, `ally`, `path` (`peace`, `war` ou null), `conflict` (`open`, `peace`, `won`, `treaty`), `asked`, `post`, `feast`. Sauvegardé sous `world.diplo` seulement s'il a bougé (`saveDiplo`) ; relu par `readDiplo` : valeurs inconnues ignorées, état vierge pour une partie d'avant ; un allié sans rencontre sous-entend la rencontre ; l'ancienne voie `neutral` redevient « pas choisie » et la carte du dénouement se rouvre (`asked` faux) ; l'ancien champ `warned` est oublié.
- Les effets `diplo` passent par `applyEffects` → `applyDiplo`. `redoEffects` les retire (comme les savoir-faire).
- `Expeditions.list` filtre par `missionOffered` ; `why` refuse par `missionWhy` (archipel, déjà faite, allié, voie, conflit réglé). La paix reste proposée après la trêve (conflit `peace`) pour la fête ; la guerre seulement tant que le conflit est ouvert.
- Le monument de la concorde n'apparaît dans la barre de construction et dans la fenêtre du nouvel âge que si `kindOffered` (archipel et voie de la paix, ou trêve signée).
- Noms des peuples et des îles : `peopleName`, `isleName` (« les Sablais », « l'île des Sables » ; « les Jadéens », « l'île de Jade »), traduits.

## Liens avec les autres systèmes
- [grand-choix.md](grand-choix.md) : « Explorer le monde », la cinématique, à la fin de laquelle s'ouvre la carte de l'allié.
- [expeditions.md](expeditions.md) : missions, effets, pourparlers (`talks`), imprévus propres (`own`), l'expédition militaire.
- [ages.md](ages.md) : la condition du conflit réglé, `beforeAdvance`.
- [fin-de-partie.md](fin-de-partie.md) : le cosmodrome chez l'allié.
- Autres chantiers : l'or, le comptoir, la construction chez l'allié et le tutoriel de l'archipel (lisent `onAllyChosen` / `diplo.ally`, `rivalPost`, `tributePerDay`, `WAR_SPOILS`) ; le conflit naval (`conflictState`).

## Pièges et invariants
- **Construire hors de l'île principale** : on ne bâtit que dans le cadre de l'île principale (`inMain`, dans `canPlace` et au clic de `ToolController`), **sauf le cosmodrome** quand l'archipel est accepté, qui ne se pose que chez l'allié. Sans routes chez l'allié, les équipes des expéditions spatiales n'ont pas de chemin jusqu'à lui (elles travaillent là où elles s'arrêtent, `OUT_MAX`) et la parade n'a pas de route.
- Les imprévus de la diplomatie n'ont pas de mise en scène (`stageEvent`) : la décision s'affiche, la scène ne joue rien de propre. Leurs textes ne décrivent que ce qui se passe à bord, sur le quai ou au large.
- La carte du dénouement n'a pas de croix : on l'ouvre pour choisir ou changer de voie. `choosePath` après le règlement est refusé.
- La bannière `VOY_CONTACT` de la cinématique (`voyageCine.ts`) n'est plus affichée : la carte de l'allié la remplace.

## Pour modifier
- **Ajouter une étape de paix** : une mission `talks: true` (âge 3, `risk: 0`, `lose: []`), son id dans `PEACE_CHAIN`, son effet `diplo` (nouvel `DiploAct` dans `applyDiplo`, `DIPLO_NAME` et `DIPLO_ICON` de `missions.ts`), un ou deux imprévus `missions: [id]`, la traduction ; `tests/diplomatie.test.ts`.
- **Brancher la grande bataille** : `startAllyBattle` la lance et met `Game.allyBattle` ; à la victoire, `winAllyWar`, le butin (comme dans `applyEffects`) ; le tribut suit seul.
- **Changer la condition** : `conflictItem`, `CONFLICT_LABEL` (le libellé sert de clé au panneau, au conseil et à la traduction), `settleLate`.
