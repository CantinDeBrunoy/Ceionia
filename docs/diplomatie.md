# Les îles rivales : découverte et diplomatie

> Fichiers : `src/sim/diplomacy.ts` (état `DiploState`, règles, crochets de la guerre et du conflit en décor `conflictState`), `src/world/archipelago.ts` (place des îles, `People`), `src/sim/missions.ts` (missions `contact`, `envoys`, `truce`, `feast`, effet `diplo`, champ `talks`), `src/sim/events.ts` (imprévus de la diplomatie, `EventCtx.own`), `src/sim/expeditions.ts` (`list`, `why`, `chance` des pourparlers), `src/ui/diploChoice.ts` (cartes du choix de l'allié et du dénouement, blasons `crest`), `src/main.ts` (`stepDiplo`, `choosePath`, `diploLine`, `treatyBanner`, `sim.beforeAdvance`), `src/sim/sim.ts` (`beforeAdvance`), `src/world/world.ts` (`diplo`, règle du cosmodrome dans `canPlace`), `src/build/catalog.ts` et `src/render/models.ts` (monument de la concorde `concord`).
> Tests : `tests/diplomatie.test.ts`, `tests/expeditionsBornees.test.ts` (chaque étape se joue jusqu'au bout).
> Voir aussi : [iles.md](iles.md) (les îles et les villes de décor), [expeditions.md](expeditions.md), [ages.md](ages.md), [fin-de-partie.md](fin-de-partie.md), [monde-carte.md](monde-carte.md), [portail-ile.md](portail-ile.md) (la carte du choix dont les nôtres reprennent le style), [sauvegarde.md](sauvegarde.md), [traduction.md](traduction.md).

## En bref
Quand le joueur accepte d'« explorer le monde » (passage au Médiéval, ou plus tard), la carte s'agrandit et deux îles rivales apparaissent, celle des **Sablais** (style oriental, `orient`) et celle des **Jadéens** (style asiatique, `asie`), en guerre l'une contre l'autre. Une expédition de **premier contact** les rencontre, puis une carte fait choisir **l'allié** (définitif). À l'âge **industriel**, le conflit se dénoue : **la paix** (trois expéditions de pourparlers, sans échec possible), **la guerre** aux côtés de l'allié (pour l'instant seulement engagée : la bataille viendra), ou **la neutralité**. Au passage au **Moderne**, un conflit encore ouvert se règle sans nous par un **traité**. Tout est facultatif : rien de ceci n'existe sans l'archipel, et rien ne conditionne un âge. Le cosmodrome se pose chez l'allié.

## Règles du jeu

### L'archipel accepté
`archipelagoOn(w)` (`world/expand.ts`, réexportée par `diplomacy.ts`) = `!!w.isles` : la place des îles n'existe que dans une partie agrandie par « Explorer le monde » (ou née archipel, version 4). C'est la seule question à poser ; toute la diplomatie la lit. L'âge d'acceptation est `world.exploredAt` (session « carte plus grande »). À la fin de la cinématique des îles (`Game.onIslesRevealed`), la bannière « Le premier contact » paraît, et un message mène à l'expédition du même nom.

### La découverte (Médiéval)
- Mission `contact` « Le premier contact » (`missions.ts`, âge 2, non obligatoire, en mer, scène `voyage`) : deux choix, prudent (pavillon blanc, risque 0,08) et audacieux (accoster, 0,22). Elle peut échouer et se retente. Réussie : effet `{ t: 'diplo', act: 'meet' }` → `diplo.met` = les deux peuples. Ses imprévus propres : `warsails`, `gifts` (`events.ts`), plus ceux de la mer.
- Proposée seulement avec l'archipel (`missionOffered`), y compris à un âge plus tard (une partie qui accepte au Moderne la trouve dans la liste, comme toute mission d'un âge passé).
- **Carte du choix de l'allié** (`DiploChoice.showAlly`) : dès que `allyPending` (les deux rencontrés, pas d'allié), au calme (en jeu depuis 3 s, en surface, sans fenêtre, fondu, tutoriel ni autre carte), et tant que le joueur n'a pas choisi : pas de croix. Les deux peuples côte à côte avec leur blason (`crest`), leur île et leurs mœurs. `chooseAlly` : une seule fois. Bannière « Une alliance ! ».

### Le dénouement (Industriel)
`endgameOpen(w, âge)` : archipel, allié choisi, conflit `open`, âge 3 (`ENDGAME_AGE`). La **carte du dénouement** (`showPath`) s'ouvre d'elle-même une fois (`diplo.asked`), puis depuis la ligne « ⚖️ Le conflit des deux îles » en tête du rayon Vie (`diploLine`, bouton « Choisir… » ou « Changer… »). Trois voies (`choosePath`), qu'on peut changer tant que le conflit dure :
- **Négocier la paix** (`peace`) : ouvre la chaîne `PEACE_CHAIN` = `envoys` → `truce` → `feast` (âge 3, `requires.missions` en chaîne). Ce sont des **pourparlers** (`Mission.talks`) : `risk: 0`, `lose: []`, `chance` vaut 0 quoi qu'il arrive, aucune option d'imprévu ne blesse, et seuls les imprévus qui nomment la mission surviennent (`EventCtx.own` : ni requin ni grain). Chaque étape réussie ne se refait pas (`missionWhy`). Récompenses :
  - `envoys` « Les émissaires » : le **comptoir chez l'île rivale** (`diplo.post`, lu par `rivalPost(w)` pour la session de l'or) ;
  - `truce` « La trêve des deux îles » : le conflit passe à `peace` (les escarmouches cessent) et le **monument de la concorde** se débloque (`concord`, `reqMission: 'truce'`) ;
  - `feast` « La fête des trois peuples » : `diplo.feast`, bien-être durable, invités ramenés, et deux fêtes au retour au lieu d'une (`main.ts`).
- **Aider notre allié** (`war`) : la guerre est **engagée** (`warEngaged`). `startAllyBattle(w)` est le crochet de la future bataille : il ne fait rien et renvoie faux (un toast dit que la bataille reste à venir). Récompenses préparées dans `WAR_SPOILS` (butin 60 or, tribut 2 or par jour lu par `tributePerDay`, monument de la victoire à créer) ; `winAllyWar` passe le conflit à `won`.
- **Ne pas s'en mêler** (`neutral`) : rien.

### Le traité (passage au Moderne)
- Tant que `treatyAhead` (archipel, âge 3, conflit `open`, quelle que soit la voie), le panneau d'âge affiche « Les deux îles vont régler leur conflit sans vous. » sous les conditions.
- Le premier clic sur « Passer à : Moderne » est retenu une fois (`ageGate` → `diplo.warned`, toast « … Cliquez encore pour passer à l'âge suivant. ») ; le second passe.
- Au passage (`onAgeUp`), `settleAtAge` : un conflit `open` devient `treaty` (voie `neutral` si aucune n'était prise) et une bannière « Le traité des deux îles » l'annonce. `stepDiplo` fait de même pour une partie chargée déjà au-delà (une partie qui accepte l'archipel au Moderne voit les îles en paix).
- **Pas de passage d'âge pendant une bataille** : `ageGate` refuse si `Game.allyBattle` (toujours faux tant que la bataille n'existe pas).

### Le conflit en décor
`conflictState(w)` donne l'état du conflit sous la forme que lit le conflit naval vivant (`ConflictState` de la session « conflit naval », `sim/navalConflict.ts`) : `{ kind: 'war' }` tant qu'il est `open` (escarmouches), `peace` ou `treaty` (commerce), `{ kind: 'won', winner: allié }` (patrouilles), null sans archipel. C'est **la seule fonction à brancher** sur `NavalConflict.state` quand sa branche sera fusionnée (une ligne dans `main.ts`).

### Le cosmodrome
`spaceportWhy` (appelé par `World.canPlace` pour `spaceport`) : sans archipel, rien ne change (l'île principale) ; avec, il faut un allié et les quatre coins sur son île (`onRival` : l'union de ses lobes, à 3 cases près ; la terre est vérifiée par ailleurs). Voir [fin-de-partie.md](fin-de-partie.md).

## Fonctionnement dans le code
- `World.diplo` (`DiploState`) : `met`, `ally`, `path`, `conflict` (`open`, `peace`, `won`, `treaty`), `warned`, `asked`, `post`, `feast`. Sauvegardé sous `world.diplo` seulement s'il a bougé (`saveDiplo`) ; relu par `readDiplo` (valeurs inconnues ignorées, état vierge pour une ancienne partie ; un allié sans rencontre sous-entend la rencontre).
- Les effets `diplo` passent par `applyEffects` → `applyDiplo`. `redoEffects` les retire (comme les savoir-faire).
- `Expeditions.list` filtre par `missionOffered` ; `why` refuse par `missionWhy` (archipel, déjà faite, allié, voie, conflit réglé). La paix reste proposée après la trêve (conflit `peace`) pour la fête.
- Le monument de la concorde n'apparaît dans la barre de construction et dans la fenêtre du nouvel âge que si `kindOffered` (archipel et voie de la paix, ou trêve signée).
- `Sim.beforeAdvance(next)` : dernier mot avant un passage d'âge réussi, posé par `main.ts`.
- Noms des peuples et des îles : `peopleName`, `isleName` (« les Sablais », « l'île des Sables » ; « les Jadéens », « l'île de Jade »), traduits.

## Liens avec les autres systèmes
- [expeditions.md](expeditions.md) : missions, effets, pourparlers (`talks`), imprévus propres (`own`).
- [ages.md](ages.md) : `beforeAdvance`, l'avertissement du traité, aucune condition d'âge.
- [fin-de-partie.md](fin-de-partie.md) : le cosmodrome chez l'allié.
- [portail-ile.md](portail-ile.md) : la carte du choix du portail, modèle des nôtres (styles copiés sous `#diploChoice` dans `hudTheme.css`).
- Sessions en cours : l'agrandissement et la cinématique (« carte plus grande »), l'or et le comptoir (lit `rivalPost`, `tributePerDay`, `WAR_SPOILS`), le conflit naval (lit `conflictState`), les villes des peuples.

## Pièges et invariants
- **Construire hors de l'île principale** : on ne bâtit que dans le cadre de l'île principale (`inMain`, dans `canPlace` et au clic de `ToolController`), **sauf le cosmodrome** quand l'archipel est accepté, qui ne se pose que chez l'allié. Tant que la construction chez l'allié (routes, liaison) n'existe pas, il y est isolé : les équipes des expéditions spatiales n'ont pas de chemin jusqu'à lui (elles travaillent là où elles s'arrêtent, `OUT_MAX`) et la parade n'a pas de route. À reprendre avec le chantier de la construction chez l'allié.
- Les imprévus de la diplomatie n'ont pas de mise en scène (`stageEvent`) : la décision s'affiche, la scène ne joue rien de propre. Leurs textes ne décrivent que ce qui se passe à bord ou sur le quai.
- Les noms « Sablais » et « Jadéens » sont posés ici ; la session des villes des peuples doit les reprendre (ou les changer ici, dans `peopleName` et dans les textes des missions).
- `choosePath` après la trêve est refusé (conflit plus `open`) : la carte du dénouement ne s'ouvre plus.

## Pour modifier
- **Ajouter une étape de paix** : une mission `talks: true` (âge 3, `risk: 0`, `lose: []`), son id dans `PEACE_CHAIN`, son effet `diplo` (nouvel `DiploAct` dans `applyDiplo`, `DIPLO_NAME` et `DIPLO_ICON` de `missions.ts`), un ou deux imprévus `missions: [id]`, la traduction ; `tests/diplomatie.test.ts`.
- **Brancher la bataille** : `startAllyBattle` la lance et met `Game.allyBattle` ; à la victoire, `winAllyWar`, puis le butin et le tribut (`WAR_SPOILS`).
- **Changer le traité** : `settleAtAge`, `treatyAhead`, `ageGate`.
