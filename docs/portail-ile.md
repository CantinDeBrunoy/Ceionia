# Portail, île et invasion

> Fichiers : `src/world/portal.ts` (île du portail : génération, défenses, jours et vagues tenus), `src/sim/war.ts` (classe `War` : états `pve` et `inv`, vagues, issues), `src/sim/isleBattle.ts` (`IsleMap`, `IsleBattle` : le combat sur l'île), `src/sim/hell.ts` (planification des vagues : `planRaid`, `planInvasion`, `spawnRaid`, `endRaid`), `src/sim/hellBalance.ts` (taille et composition), `src/ui/portalChoice.ts` (carte du choix), `src/ui/command.ts` (ruban de l'île, menu « Ma garnison »), `src/ui/warTips.ts`, `src/render/portal.ts` (arche), `src/render/isleFerry.ts` (galère), `src/render/isleRuins.ts` (défenses abattues), `src/world/blight.ts` (contamination), `src/main.ts` (`stepWar`, `commandIsle`, `leaveIsle`, `goIsle`, `pveLine`).
> Tests : `tests/portail.test.ts`, `tests/invasion.test.ts`, `tests/defensesPortail.test.ts`, `tests/menuIle.test.ts`, `tests/equilibreEnfers.test.ts`, `tests/equilibreBatailles.test.ts`, `tests/contamination.test.ts`, `tests/ferry.test.ts`, `tests/voletMilitaire.test.ts`.
> Voir aussi : [enfers.md](enfers.md), [armee-combat.md](armee-combat.md), [fin-du-royaume.md](fin-du-royaume.md), [expeditions.md](expeditions.md), [remparts.md](remparts.md), [tutoriel.md](tutoriel.md), [architecture.md](architecture.md), [sauvegarde.md](sauvegarde.md), [ages.md](ages.md).

## En bref
Au large du continent, une île porte une arche : le portail des Enfers. L'expédition « Le portail de l'autre rive » l'ouvre ; on y bâtit alors une tour de garde et une caserne, on y recrute une garnison, et des démons y attaquent par vagues. Tout ce volet militaire (invasion, Enfers, royaume) est **facultatif** : à l'ouverture, le joueur choisit d'affronter les démons ou de refermer le portail. Seule l'expédition d'ouverture compte pour passer l'Antiquité ; l'île, l'invasion et les Enfers ne conditionnent plus aucun âge. Les démons n'attaquent jamais que l'île, jamais le continent.

## Règles du jeu
### Ouvrir le portail
- L'île existe sur toute carte où la mer a de la place (`addPortalIsland` ; sinon `world.portal` est `null` et la mission n'est pas proposée). Rayon `ISLE_R` = 11 à 15 cases (tiré de la graine), `ISLE_MIN` = 8 si la mer manque de place, bras de mer d'au moins `STRAIT_MIN` = 8 cases, replat central à `ISLE_TOP` = 1,15. Si le large est trop étroit, `carveStrait` fait reculer la côte la plus basse.
- `World.portalOpen` = l'île existe et `exp.done` contient `portal` (mission `portal`, `missions.ts`, Antiquité, `mandatory: true`, débloque la tour de garde), ou `World.portalWoken` : au bac à sable, le portail s'ouvre de lui-même dès l'Antiquité, sans l'expédition (`Sim.update`, voir [bac-a-sable.md](bac-a-sable.md)). Elle reste obligatoire pour sortir de l'Antiquité quand la carte a une île (`sim.ts` : `mandatoriesFor`, `m.id !== 'portal' || w.portal`).
- À l'arrivée en Antiquité, un toast mène à la mission (`sim.onAgeUp`, `main.ts`) ; la bulle d'aide `portal` fait de même (`warTips.ts`).

### Le choix : affronter ou refermer
- Dès que le portail est ouvert, `War.pve` vaut `ask`. `stepWar` ouvre alors **une seule fois** la carte du choix (`PortalChoice.show`, `war.choiceSeen`) si on est en surface, sans fenêtre ouverte ni fondu.
- « Affronter les démons » : `acceptPve()` → `pve = 'on'`, toast qui dit de poser une tour et une caserne. « Fermer le portail » : `closePortal()` → `pve = 'off'`, éclat doré (`portalSealed`), tourbillon éteint (`War.closed`, lu par `portalView.update` dans `main.ts`).
- `closePortal` refuse si une vague est en cours, annoncée (`coming`) ou si l'invasion est déjà repoussée (`inv === 'done'`) ; la carte ne le dit pas (elle se ferme sans message).
- Portail fermé (`off`) : aucune vague, aucun passage (`hellWhy` : « Le portail est refermé »), les bulles d'aide de l'île se taisent (`WarTipState.pve`). La garnison, la caserne et les soins continuent. Rouvrir : bouton « Rouvrir » en tête du rayon Militaire (`pveLine`, `ui.ts`), pastille « 🔒 Portail fermé » du ruban de l'île (`waveStatus`), ou toast de `enterHell`. La carte rouverte propose « Affronter les démons » ou « Garder le portail fermé » (`data-a="keep"`, sans effet).
- **Une fois `on`, aucun bouton ne referme** (rien n'appelle `closePortal` hors de la carte, qui ne s'ouvre plus). Le texte « Vous pourrez changer d'avis dans l'onglet Militaire » n'est vrai que de `off` vers `on`.
- `pve` repasse seul à `on` si l'invasion est déjà `done`, `raid` ou `coming` (`War.update`).

### L'île : traversée, défenses, garnison
- On n'y bâtit que des défenses (`DEFENSES` : tour de garde, caserne, mur, porte ; règle `World.portalRule`) : en entier sur l'île (`onPortalIsland` : rayon `p.r + 2` autour du centre), portail ouvert, jamais sur le portail (`inPortal`, 4 cases autour de `p.x, p.z`). Les mêmes bâtiments se posent aussi au village (patrouilles, places de garnison).
- Tour de garde 1×1, caserne 2×2 (`catalog.ts`). Au combat (`SITES`, `hell.ts`) : tour 360 pv, armure 3, tire 9 dégâts à 6,5 cases toutes les 1,5 s ; caserne 520 pv, armure 4. Vie et dégâts × `defenseK(age)` = 1 + 0,25 × (âge − 1).
- Entre les vagues, les défenses se réparent de `REPAIR` = 2 % de leur vie par seconde ; une défense rasée se relève à `REBUILD` = 40 % à la fin de la vague (`IsleBattle.endRaid`), ses ruines fument (`isleRuins.ts`).
- Les recrues traversent le bras de mer en galère (`IsleFerry`, vue seule, `CROSS` = 8 s, dans les dernières secondes du recrutement). La garnison se rassemble devant la première caserne debout (`rallyPoint`), sinon au pied d'une tour, sinon devant des ruines de caserne, sinon devant le portail (`arrival` = portail + 3 cases au sud).
- Le commandement de l'île (`commandIsle`) : la vue se place sur le portail, le théâtre `isle` est donné à `CommandUI`. Quitter : bouton « ↩ Retourner au village », Échap quand rien n'est choisi (`escapeAction`), ou prendre un outil de construction (`bindKeys`). Les actions du village demandées de là passent par `ensureSurface` (`SurfaceGate`, `core/surface.ts`).
- Le menu de l'île « Ma garnison » (`isleRow`) reprend celui des Enfers : onglet Bâtir (tour, caserne, remparts : poser quitte le commandement, `buildDefense`) et Recruter. Détails des recrues : [armee-combat.md](armee-combat.md).
- Le ruban du haut (`render`) : vague en cours ou compte à rebours, contamination, garnison `armySize / armyCap`, blessés, pas du guidage.

### L'invasion
États de `War.inv` : `wait` → `ready` → `coming` → `raid` → `done`.
- `wait → ready` (`stepInvasion`, seulement si `pve === 'on'`) : au moins 1 tour et 1 caserne debout sur l'île et `garrison()` ≥ `invasionNeed()` = `invasionTroops(difficulté)` = 3 soldats valides sur l'île (2 en Facile et au bac à sable). Toast « Cliquez ici pour voir l'île ». Rien ne part sans clic du joueur.
- `ready → coming` : bouton « Affronter » du ruban (`startInvasion`) : `nextRaid = time + INVASION_DELAY` (10 s), vague figée par `planInvasion`, bannière et toast.
- `coming → raid` : la vague sort du portail (`spawnRaid`, `isle.startRaid`), la vue se place sur l'île.
- `raid → done` si repoussée (`repelWave`, bannière « Invasion repoussée », les Enfers s'ouvrent), `raid → wait` si l'île est submergée (re-annonce possible).
- Retour arrière : `ready → wait` et `coming → wait` si la tour ou la caserne disparaît (compte à rebours arrêté, `planned` et `nextRaid` remis à zéro).
- Taille : `planInvasion` = `INVASION_SIZE` 5 démons au niveau `INVASION_LEVEL` 4 (trois diablotins, un archer de braise, une brute, `raidKinds`) à l'Antiquité, sans tenir compte de l'armée (`power: 0`). Facile garde les trois premiers (`planWave`) ; le bac à sable prend `INVASION_SIZE − 2` = 3 démons (« legacy »). Aux âges suivants, le plancher d'âge grossit la vague (`compose`).
- Après la victoire, le guidage (`guideStep`) mène aux Enfers : choisir les troupes (« Tous »), puis « Envoyer aux Enfers ».

### Les vagues (incursions)
- Tant que `inv` est `wait` ou `ready`, ou `pve !== 'on'`, aucune vague ne vient (`waiting` dans `War.update`). Ensuite, une vague vient s'il y a une tour (`isleDefenses().towers > 0`).
- Après l'invasion, `spawnRaid` fixe la suivante : `raidInterval(niveau, sécurisée)` = max(`RAID_MIN` 150, `RAID_EVERY` 240 − 10 × niveau) secondes, doublé une fois l'île sécurisée. `RAID_FIRST` = 300 s ne sert qu'à une partie sans invasion préparée (`raidDue` fixe la première échéance au premier appel). Niveau = vagues repoussées + 1 (`raidLevel`).
- Annonce : `WARN_TIME` = 40 s avant l'arrivée, la composition est figée (`f.planned = planRaid()`) et dite au joueur (« une vague de n démons, dont… »). `waveForce` classe la vague petite, moyenne ou grosse (par rapport à deux diablotins).
- Le cor 🎺 (`callWave`) fait venir la suivante tout de suite ; refusé si une vague est en cours, si l'invasion n'est pas annoncée, sans soldat sur l'île, ou tant qu'un poste avancé tient dans les Enfers (`frontPosts > 0`, voir [enfers.md](enfers.md)). Dans ce dernier cas `nextWaveIn()` est `null` : aucun compte à rebours n'est affiché.
- Taille réelle (`planWave`, `hellBalance.ts`) : voir « Fonctionnement ». Facile ×0,6 (`BALANCE_EASY`), bac à sable : l'ancienne vague (`raidSize`, `raidKinds`, plafonnées à `RAID_MAX` 10).
- Issue (`IsleBattle.outcome`) : repoussée quand plus aucun démon ; perdue quand toutes les défenses sont tombées (ou, sans défense, plus aucune unité du joueur) ; une vague qui traîne `RAID_LIMIT` = 180 s de jeu compte pour repoussée (ses derniers démons repassent le portail). Une défaite allège la vague suivante (× `EASE_LOSS` 0,82 par défaite d'affilée, trois au plus).
- L'île est **sécurisée** après `SECURE_WAVES` = 5 vagues repoussées (`Hell.islandSecured`) : les vagues suivantes sont des escarmouches (`SECURED_K` 0,65, intervalle doublé). Mais l'étape n'est plus exigée pour changer d'âge.

### Les jours tenus
`holdIsle` (`portal.ts`, appelé chaque image par `main.ts`) ajoute 1 à `isleGuard.days` par jour de jeu où l'île a sa tour et sa caserne. C'est un relevé : aucune règle n'en dépend (`ISLE_SECURE.days` = 6 et `Hell.heldFor` / `daysHeld` ne sont lus nulle part).

## Fonctionnement dans le code
- **Deux simulations `Hell`** : la faction des Enfers (`War.faction`, carte `HellMap`) porte l'horloge des vagues, les compteurs et la planification ; le combat de l'île se joue dans `IsleBattle.sim`, un `Hell` sur `IsleMap` sans zone ni garnison (`gate` faux), qui ne contient que les démons d'une vague et les unités du joueur. `isle.step` ne lit pas les échéances.
- **`IsleMap`** : carte locale `W = L = 2 × ceil(p.r + 3)`, `ox`, `oz` = case du monde du coin ; `land` = terre de l'île (`cellAvg > 0,08`), `block` = portail ou case occupée (`w.occ`). Coordonnées du combat = monde − (`ox`, `oz`) (`toWorld`, `toLocal`). `refresh()` relit la carte ; `syncDefenses(age)` (appelé à chaque `War.update`) crée ou retire les bâtiments au combat pour chaque tour et caserne de l'île, puis ne rafraîchit **que** si l'un d'eux a changé.
- **Pas de temps** (`War.update`) : l'île avance par pas de `COARSE` = 0,25 s, au plus 4 par image ; la faction aussi (en vue : à chaque image par pas de 0,25 s ; hors vue : accumulateur `acc`, 4 pas au plus par appel, le reste jeté s'il dépasse un pas). Les échéances sont en secondes de `Hell.time`, qui ne court qu'avec ces pas : une machine très lente à ×8 prend du retard sur l'horloge du jeu.
- **Ordre d'une image** (`War.update`) : âge et `armyPower` → états hérités → synchronisation des défenses et de la contamination (`refreshBlight`) → `stepArmy` (recrues, soins) → déploiement des troupes valides → pas de la faction (+ base, + roi) → `baseNews` → pas de l'île → `collect` des événements → passage du portail → `stepInvasion` → annonce et arrivée de vague → issue → relevé des positions et vies pour la sauvegarde. Renvoie la vague arrivée (`main.ts` : `audio.sfxRumble`).
- **Plan de vague** (`Hell.planRaid`) : `planWave({ level, age: tierAge(age), power: armyPower, legacy: raidKinds(...), powers: DEMON_POWER, balance, secured, conquered, losses })`. `armyPower` = `War.power(age)` : puissance (`powerOf` = √(vie × dégâts / cadence)) des troupes (blessés ×0,5, recrues en route ×0,5) + tours de l'île × `defenseK`. Plancher : puissance de la vague « legacy » × (1 + `AGE_FLOOR` 0,75 × (âge − 1)). Armée : `armyWave(power)` = `WAVE_RATIO` 0,95 × power, × `ramp(niveau)` (0,5 au niveau 1, + 0,125 par niveau, plafonné à 1 au niveau 5), × `SECURED_K`, × max(0,5 ; 1 − 0,08 × zones conquises), × `EASE_LOSS`^défaites. On prend le plus grand des deux, × `balance.k`, puis `compose` répartit entre les sortes autorisées (`TABLE` : diablotin, archer, brute, chef dès l'âge 1 niveau 7, golem âge 2, cornu âge 3, seigneur âge 4, titan âge 5) ; plafond `WAVE_MAX` 160. Jusqu'à l'Antiquité sans armée au-dessus du plancher : exactement la vague d'avant.
- **Sauvegarde** : `WarSave` (`invasion`, `pve`, `choiceSeen`, `visited`, `raid` avec ses démons debout et `t`, plus `faction`, `army`, `base`, `king`). À la lecture, `coming` devient `ready` (pas de vague surprise). Sans `invasion` ou sans `pve` (ancienne sauvegarde), l'état est déduit à la première mise à jour (`readLegacyInvasion` : faite si un âge ≥ 2, une vague, les Enfers visités… ; `readLegacyPve` : `on` si la partie jouait déjà le PvE, `off` si le champ ancien `sealed` valait vrai, sinon `ask`). `Hell.save` ne garde ni `planned` ni `lossStreak` : après rechargement, la prochaine vague est recomposée et la série de défaites oubliée.
- **Nouvelles** (`WarNews.kind`) : `main.ts › stepWar` choisit toast, bannière ou alerte selon le genre (`invasionReady`, `invasion`, `invasionStart`, `invasionDone`, `raid`, `lost`, `repelled`, `secured`, `portalSealed`). L'alerte « 🔥 Incursion… » ou le compte à rebours reste affiché en haut tant qu'on ne regarde pas l'île (`command.alert`, bouton « Voir l'île »).
- **Contamination** (`world/blight.ts`, hors de ce fichier) : jauge de 0 à 1 déduite des défenses, vagues repoussées (`isleGuard.waves`) et zones conquises ; elle durcit un peu les démons près du portail (`demonBoost`, +20 % au plus) et accélère les soins de la garnison (`healBoost`). Rien n'est sauvegardé.

## Liens avec les autres systèmes
- [expeditions.md](expeditions.md) : la mission `portal`, la galère, l'atelier du village qui fabrique les pièces.
- [armee-combat.md](armee-combat.md) : recrutement, troupes, commandement, simulation `Hell`.
- [enfers.md](enfers.md) : `hellWhy` verrouille l'entrée tant que l'invasion n'est pas repoussée ; les postes avancés suspendent les vagues.
- [fin-du-royaume.md](fin-du-royaume.md) : le royaume tombé éteint le portail, l'invasion compte pour faite, plus aucune vague.
- [remparts.md](remparts.md), [placement-construction.md](placement-construction.md) : murs et portes sur l'île.
- [sauvegarde.md](sauvegarde.md) : `world.war` = `War.save()` ; `isleGuard` est dans la sauvegarde du monde (`world.ts`).
- [tutoriel.md](tutoriel.md) : chapitres de l'île ; les bulles d'aide (`warTips.ts`) se taisent pendant le tutoriel.

## Pièges et invariants
- **Deux compteurs de vagues** : `world.isleGuard.waves` (incrémenté par `repelWave`, lu par la contamination et `isleProgress`) et `Hell.raidsRepelled` (niveau, sécurisation, intervalle). Ils évoluent ensemble, mais sont sauvegardés à deux endroits ; la chute du royaume force les deux (`conquerKingdom`, `claimKingdom`).
- Une vague déjà repoussée fait passer `inv` à `done` quoi qu'il dise (`War.update`) ; ne pas compter sur `inv` seul pour savoir si l'invasion a eu lieu.
- `skipInvasion()` (tests, mode développeur) force `inv = 'done'` et `pve = 'on'`.
- Les tests créent `new War(w)` sans choix : `pve` vaut `ask`, rien ne se passe. Il faut `acceptPve()` ou `skipInvasion()` (voir `pveWar` dans `invasion.test.ts`).
- **Murs posés sur l'île** : `IsleMap.block` n'est relu que si une tour ou une caserne apparaît ou disparaît (`syncDefenses`). Un rempart posé seul sur l'île n'entre pas dans les emprises du combat avant (à vérifier en jeu).
- Un démon coincé hors d'atteinte retardait toute la suite : `RAID_LIMIT` existe pour ça.
- Les commentaires de `hellBalance.ts` (« 0,4 à la première vague, 1 à la sixième ») et de `ISLE_SECURE` (« étape obligatoire ») sont périmés ; les constantes font foi.
- Une vague de `raid` sauvegardée est reprise sans sa composition annoncée : ses démons sont recréés avec les stats de la zone 1 (`demonStats(kind, 1)`).
- La carte du choix ne doit pas s'ouvrir sur une fenêtre ou pendant un fondu : la condition de `stepWar` le vérifie ; garder cette garde en la déplaçant.

## Pour modifier
- **Changer la taille d'une vague** : constantes de `hellBalance.ts` (`WAVE_RATIO`, `RAMP_*`, `TABLE`), ou `raidSize` / `raidKinds` (plancher) dans `hell.ts` ; vérifier `equilibreEnfers.test.ts`.
- **Changer les conditions de l'invasion** : `stepInvasion` et `invasionTroops` (`war.ts`), le texte d'attente dans `waveStatus` (`ui/command.ts`), `invasion.test.ts`.
- **Ajouter un état au PvE** : champ dans `War` + `WarSave`, relu avec une valeur par défaut dans `load`, lu par `hellWhy` ; traduction anglaise des textes (`src/i18n/en/war.ts`).
- **Ajouter une défense sur l'île** : `DEFENSES` (`catalog.ts`), `syncDefenses` et `PlayerSiteKind` (`hell.ts`) si elle combat, `SITES`, tuile de `isleRow`.
- **Changer la forme de l'île** : `isleRadius`, `addPortalIsland` ; garder la génération déterministe (graine) et la validation de `readPortal`.
