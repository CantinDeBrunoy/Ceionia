# Les Enfers

> Fichiers : `src/world/hell.ts` (`HellMap` : carte, zones, emplacements, `ZONE_AGE`), `src/sim/hell.ts` (`Hell` : faction, garnisons, alertes, conquête, `frontier`), `src/sim/hellBase.ts` (`HellBase`, `BASE_DEFS` : base avancée, contre-attaques, front, reprise), `src/sim/objective.ts` (`nextGoal`, `goalLine`), `src/sim/war.ts` (`hellWhy`, passage du portail, `buildBase`), `src/hellMode.ts` (`HellMode`), `src/render/hellView.ts` (vue), `src/render/hellSites.ts` (bâtiments démoniaques, par zone), `src/render/hellDecor.ts` (décor vivant), `src/render/hellCritters.ts` (petites bêtes), `src/render/hellBase*.ts` (bâtiments de la base par âge), `src/ui/command.ts` (frise du front, marqueur d'objectif, menu « Ma base »), `src/main.ts` (`enterHell`, `exitHell`, `hellTheater`, `hellFocus`).
> Tests : `tests/enfers.test.ts`, `tests/ageEnfers.test.ts`, `tests/baseAvancee.test.ts`, `tests/baseAges.test.ts`, `tests/front.test.ts`, `tests/guidageEnfers.test.ts`, `tests/equilibreBatailles.test.ts`, `tests/recrutementEnfers.test.ts`, `tests/outilsBase.test.ts`.
> Voir aussi : [portail-ile.md](portail-ile.md), [armee-combat.md](armee-combat.md), [fin-du-royaume.md](fin-du-royaume.md), [ages.md](ages.md), [architecture.md](architecture.md), [tutoriel.md](tutoriel.md), [monde-souterrain.md](monde-souterrain.md).

## En bref
Les Enfers sont une longue faille de cavernes (64 × 184 cases) qui descend du portail, au nord, jusqu'au royaume démoniaque, au sud : sept zones, chacune fermée par une brume tant que la précédente n'est pas conquise et que l'âge du village ne permet pas d'y entrer. Chaque zone a un avant-poste, une forge et une forteresse ; la dernière, la citadelle du roi. Le joueur y envoie des troupes par le portail, bâtit une base avancée dans les zones conquises, et peut renoncer à tout (expéditions **facultatives**). La faction démoniaque (`Hell`) vit même quand on ne la regarde pas.

## Règles du jeu
### Les zones
`HELL_ZONES` (`world/hell.ts`), `ZONE_AGE` = âge minimum (rang dans `AGES` : 1 Antiquité, 2 Médiéval, 3 Industriel, 4 Moderne, 5 Futuriste).

| n° | Zone | commence à z | âge requis |
|---|---|---|---|
| 0 | Seuil du portail (aucun démon ni bâtiment) | 0 | 1 |
| 1 | Grottes de braise | 20 | 1 |
| 2 | Rivière de lave (deux ponts) | 46 | 1 |
| 3 | Falaises cendrées (corniche au-dessus d'un abîme) | 72 | 2 |
| 4 | Gorge des os (gorge étroite) | 98 | 3 |
| 5 | Forêt de cristaux | 124 | 4 |
| 6 | Royaume démoniaque (citadelle, douves de lave) | 150 | 5 |

- Chaque zone 1 à 5 a une **forteresse** (`z1 − 8`, rayon d'emprise 1,9), un **avant-poste** (`z0 + 6`, alcôve) et une **forge** (au milieu ; `z0 + 3` pour la rivière). Le royaume : la citadelle (`kingdom`, rayon 4,2) et 4 tours (`spire`) au-delà des douves.
- La carte dépend de la graine du monde (`new HellMap(world.seed)`) : même carte à chaque partie du même monde.
- **Ouverture** (`Hell.frontier`) : la zone 0 et la zone 1 sont ouvertes d'emblée ; abattre une forteresse conquiert sa zone et ouvre la suivante. L'âge plafonne l'accès (`ageCap` = `zoneCapOfAge(age)`) : `frontier = min(conquestFrontier, max(ageCap, conquestFrontier − 1))`. Une zone déjà conquise reste ouverte même si l'âge est en retard. Brume rouge (`seals` de `hellView.ts`) sur les zones fermées. Un ordre de déplacement au-delà de la brume s'arrête devant elle (événement `sealed`, `byAge` selon la cause : « montez à l'âge… » ou « abattez d'abord la forteresse »).
- **Conquérir** : abattre la forteresse (`Hell.destroy` → `conquered[zone]`, événement `conquered`, nouvelle « La zone … est conquise »). Abattre la citadelle : victoire, voir [fin-du-royaume.md](fin-du-royaume.md).
- **Reperdre une zone** (`Hell.retake`) : sa forteresse se relève à 50 % de vie avec un gardien, une brute et deux diablotins ; les zones d'après se referment (événement `lost`). Le royaume ne se reperd pas.

### Les bâtiments démoniaques (`SITES`, `hell.ts`)
Vie × (1 + 0,1 × (zone − 1)) ; dégâts des tirs × (1 + 0,1 × (zone − 1)) × `power`. L'armure se retranche de chaque coup reçu (minimum 1).
- Avant-poste : 300 pv, armure 2, tire 6 à 6 cases toutes les 2 s. Forteresse : 1200 pv, armure 5, 10 à 7 cases, 1,6 s. Tour de la citadelle : 520 pv, armure 4, 7 à 7 cases. Citadelle : 4000 pv, armure 8, 16 à 8 cases, 1,4 s. Forge : 420 pv, armure 3, ne tire pas.
- **Forge** : toutes les `FORGE_EVERY` = 45 s, tant que sa zone n'est pas conquise, elle renvoie un démon (brute ou diablotin ; golem dès la zone 3, démon cornu dès la zone 5) si la garnison de la zone est sous sa taille initiale (`cap[zone]`).
- **Garnisons** (`garrisonOf`) : gardien + escorte à la forteresse selon la zone (table `FORT` : de 2 diablotins, 2 archers, 1 brute à la zone 1 jusqu'à 6, 6, 3, 3 chefs, 3 golems, 2 cornus, 1 seigneur à la zone 5) ; avant-poste : archer, diablotins, brute dès la zone 2, golems dès la 3 ; patrouille par zone 1 à 5 le long de la faille (`populate`). Facile : −40 % sur les troupes ordinaires (`garrisonSized`) ; bac à sable : l'ancien équilibre (`balance.legacy`). Le gardien de la zone 1 est affaibli (×0,7).
- Les démons des zones profondes sont plus coriaces (`demonStats` : × (1 + 0,15 × (zone − 1)) en vie, + 12 % de dégâts par zone ; gardien, roi et garde d'élite ont leur propre barème).
- **Alerte** (`raiseAlert`, `ALERT_TIME` = 12 s) : toute la garnison de la zone accourt, vue ×1,5. Les démons ne s'écartent pas de plus de `LEASH` = 16 cases de leur poste.
- **Renfort de zone** (`reinforce`) : à la première alerte (et chaque fois que la puissance du joueur présent dépasse de 30 % celle du dernier renfort), des démons sortent pour valoir `GARRISON_RATIO` (1) × min(1 ; 0,35 + 0,13 × zone) × `balance.k` de la puissance du joueur, au plus 80.

### L'objectif et son marqueur
- `nextGoal(hell, from)` : la zone visée est la première non conquise (`conquestFrontier`). Zone fermée par l'âge : `locked` (phrase « Zone suivante fermée : il faut l'âge… »). Sinon l'avant-poste debout le plus proche si la forteresse est plus loin de plus de 5 cases, sinon la forteresse (ou la citadelle) ; plus rien : `done`. `from` = centre des troupes, sinon le point d'arrivée.
- Interface (`ui/command.ts`) : frise du haut (`frontBar`) du portail au royaume, un rond par zone : `ok` tenue, `hot` attaquée, `cur` ouverte, `lock` fermée par l'âge, `shut` fermée par la forteresse d'avant  ; au bout de la même ligne, l'objectif en pilule crème (`.tfg` : 🎯 + `goalLine`, distance en cases mise à jour à part ; un clic centre la vue, `centerGoal` ; 🔒 et pas de clic quand la zone suivante est fermée par l'âge). Une deuxième ligne (`.tgoal`) ne paraît que pour l'alerte la plus pressante (pilule rouge brique). Plus de « Zone ouverte » (la frise le dit), de « Suivre » (la vue suit d'elle-même après un ordre, un geste reprend la main), ni de compte de l'armée. Coque crème et or de la barre du bas et du panneau des vagues de l'île (styles « Le haut de l'île et des Enfers » de `style.css`) : nom de zone en Fraunces, zones fermées en gris chaud. Marqueur à l'écran (`frame`) : anneau avec la distance, ou flèche au bord de l'écran vers l'objectif hors vue ; seulement dans le théâtre `hell`.

### La base avancée (`BASE_DEFS`, `hellBase.ts`)
Payée par le village (bois, pierre, minerai ; bac à sable gratuit). Rayon d'emprise `r`, nombre maximal `max` **par base** (camp de la zone).

| Bâtiment | coût | r | max | effet |
|---|---|---|---|---|
| Camp de base | 30 bois, 10 pierre | 1,2 | 1 | repli et apparition des troupes, soins `CAMP_REGEN` 2 pv/s |
| Caserne avancée | 40 bois, 30 pierre | 1 | 1 | recrute sur place (`TROOPS.time` × 0,75, sans traversée) |
| Forge | 20 bois, 30 pierre, 10 minerai | 1 | 1 | +20 % de dégâts, −15 % de coups reçus (`SMITHY_BOOST`, `SMITHY_GUARD`) ; forge les pièces manquantes à `SMITHY_ORE` = 4 minerai chacune |
| Infirmerie | 30 bois, 20 pierre | 1 | 1 | soins `INFIRMARY_REGEN` 6 pv/s ; les soldats tombés s'y soignent sur place, deux fois plus vite |
| Tour de guet | 20 bois, 30 pierre | 0,6 | 4 | tire 8 à 6,5 cases, 1,5 s |
| Palissade | 8 bois | 0,5 | 60 | bloque ; les démons à moins d'une case de son bord vont à `PALISADE_SLOW` = 0,55 de leur allure |
| Porte | 14 bois | 0,5 | 8 | franchie par les troupes, pas par les démons |
| Brasero | 6 bois, 2 minerai | 0,35 | 8 | éclaire, repousse la brume |

Règles de pose (`HellBase.canBuild`) : zone tenue (`Hell.held` : le seuil, ou une zone conquise et ouverte) ; d'abord un camp dans la zone ; au plus `BASE_R` = 14 cases du camp ; le camp à `CAMP_MARGIN` = 6 rangées au moins d'une zone encore aux démons ; à plus de 3,2 cases du portail ; sol libre (ni lave, ni pont, ni paroi, ni bâtiment ; une porte se pose sur une palissade) ; pas sur des troupes ; l'accessibilité depuis le portail doit rester d'un seul tenant (`keepsPath`, sauf pour une porte). Soins et forge agissent à `CARE_R` = 9 cases. Les murs se tracent en glissé de A à B (`planLine`, `buildLine`).

### Le front : contre-attaques, reprise
- **Front** : `frontPosts` = nombre de zones conquises. Tant qu'il est > 0, aucune vague ne vise l'île (`raidDue`, avec `FRONT_RESPITE` = 120 s de répit après la chute du dernier poste, événement `frontCleared`). Les démons reprennent les postes un à un, le plus profond d'abord (`deepestPost`).
- **Contre-attaque** (`HellBase.counter`) : sur la base du poste le plus profond tenu (camp, ou troupes sur place) ; la première `COUNTER_FIRST` = 180 s après la pose du camp, annoncée `COUNTER_WARN` = 45 s avant, les suivantes `COUNTER_EVERY` = 300 s après la précédente repoussée. Taille : `planWave` avec `power` = puissance des troupes présentes, plancher `counterSize` (2 + zone + n + 2 × retard d'âge, plafonné à 10 + 2 × retard) ; les démons ont les stats de la zone d'après. Repoussée quand ils sont tous abattus (`counterEnd`).
- **Chute d'un camp** (`HellBase.fall`) : tous les bâtiments de la zone s'effondrent, la zone est reperdue (`retake`, `zoneLost`) ; au seuil : `campLost`. Un poste assiégé que personne ne garde (ni camp, ni troupe) tombe après `FRONT_GRACE` = 30 s.
- **Reprise d'une zone laissée seule** (`stepReclaim`) : `RECLAIM_FIRST` = 420 s après l'abandon, préavis `RECLAIM_WARN` = 150 s, pause de `RECLAIM_COOLDOWN` = 600 s entre deux reprises ; un camp ou des troupes sur place annulent la menace.

### Entrer et sortir
- **Entrer** : clic sur le portail de l'île (outil sans outil, `build/tools.ts` → `openPortal`), clic sur le portail avec le commandement de l'île, bouton « Voir les Enfers », ou un toast de nouvelles. `enterHell` : refusée si `hellWhy()` (invasion pas repoussée, portail refermé : un toast, et la carte du choix pour un portail refermé), fondu 380 ms, vue `HellView` (`build`), caméra de trois quarts entre les troupes et l'objectif (`hellFocus`, `nextGoal`), bannière. Hors surface (`mode !== 'surface'`) elle ne fait rien.
- Caméra des Enfers : `minDist` 2,4, `maxDist` 34, `minPitch` 0,28, bornes sur la carte entière ; `war.hellInView` passe à vrai (la faction avance alors à chaque image).
- **Sortir** : bouton « Village » (en bas à droite ; `exitHell`, fondu, vue de surface remise), ou un clic gauche sur le portail des Enfers (`CommandUI.clickAt` : `atPortal` sans unité dessus → `leaveHell`, même avec des troupes choisies ; le théâtre des Enfers rend aussi le portail quand le rayon touche l'arche, `HellView.portalHit`, sinon un clic sur le haut de l'arche tombait au sol derrière elle). - **Écran allégé** (retour de l'auteur : « il y en a partout ») : aux Enfers (`body.hell`), le haut du village est caché (carte du village, besoins, horloge, expéditions, nouvelles, habitants ; restent bois / pierre / minerai, pause, vitesse, réglages). En bas, seulement les cartes des troupes au milieu (sans troupe sur place : « Renforts +n ») et, à droite, « ? » (aide des contrôles), « Ma base » et « Village ». **« Ma base » est un tiroir** (`CommandUI.baseOpen`, fermé à chaque entrée, `setTheater`) : ouvert, il montre le petit panneau d'outils (onglets Bâtir / Recruter, outils de la base) et les cartes (bâtiments : aperçu 3D à l'âge du village, nom court, coût ; ou recrues, et « Renforts » au bout de l'onglet Recruter). Poser un bâtiment l'ouvre (`startPlacing`) ; le refermer lâche le bâtiment en main et l'outil. Échap le referme quand il n'y a plus rien d'autre à lâcher (`escapeAction` → `closeBase`). La bulle d'aide ne paraît que pour poser, déplacer, démolir ou quand il n'y a pas de troupe ; le reste est dans « ? ». Voir aussi « La barre du bas » dans [armee-combat.md](armee-combat.md).
- **Outils de la base** (`CommandUI.tool` : `select`, `move`, `demolish` ; `toolDock`, `setTool`, `toolAt`, `toolHover`) : *choisir* est l'outil ordinaire (troupes, ordres). *Déplacer* : un clic prend un bâtiment de la base (`HellBase.at`), son fantôme suit le curseur (vert si `relocateWhy` accepte la case, revérifié seulement au changement de case), un clic le pose (`relocate` : gratuit, il garde sa vie ; mêmes règles que la pose, le bâtiment ôté de sa place) ; Échap ou clic droit le laissent où il était. *Démolir* : un clic désigne le bâtiment (fantôme rouge au survol), un second clic sous 4 s le démolit (`demolish` : emprise libérée, **rien n'est rendu**, comme au village). Le camp de base ne se déplace ni ne se démolit (cœur de la base). Échap lâche l'outil avant tout (`escapeAction` → `stopTool`) ; prendre un bâtiment à poser repasse sur *choisir*. **Pas de « tourner »** : les bâtiments de la base n'ont pas d'orientation (la vue les tourne d'elle-même face au portail ; palissades et portes suivent leurs voisins). Échap **ne quitte pas** les Enfers (il lâche, désélectionne, referme « Ma base », puis rappelle « Village », `escapeAction` → `hint`). Une touche d'outil du village ramène en surface (`bindKeys`), comme tout bouton du village (`ensureSurface`).
- **Troupes** : « Envoyer aux Enfers » ou clic droit sur le portail de l'île (`sendThroughPortal`) ; dans les Enfers, seulement un ordre (clic droit, appui long au doigt) sur le portail des Enfers (`PORTAL_REACH` = 2,6 cases) : plus de bouton de renvoi, jugé inutile. Sans ce geste, les troupes resteraient aux Enfers : elles comptent dans le plafond de la garnison et ne défendent plus l'île quand les vagues reprennent. Le royaume tombé, elles rentrent toutes seules (`bringHome`). Le passage se fait à moins de 3,2 cases de l'arche. « Renforts » (`callGarrison`) envoie toute la garnison valide de l'île. La première troupe qui passe met `War.visited` (le guidage s'efface).

## Fonctionnement dans le code
- `War.ensureFaction()` crée `HellMap`, `Hell` (équilibre selon la difficulté : `balanceOf`), `HellBase.load` et `KingFight.load` ; sans portail ouvert (mode développeur) la faction existe aussi. Unités du joueur : exclues de la sauvegarde de la faction (`save(false)`), recréées par `War.deploy` depuis l'armée.
- Unités : `Hell.units`, bâtiments : `Hell.buildings` (côté `hell` ou `player`). Cases `z × W + x` ; positions en cases, centre de la case = `+ 0,5`. `HellMap.walkable` : ouverte, hors emprise (`block`), hors bassin sauf pont, et pour les démons hors portes (`gate`).
- Boucle : `War.update` → `stepHell(dt)` = `faction.step`, `base.step`, `king.step`. `HellBase.step` lit les événements de la faction sans les consommer (`seen`), puis `War.collect` les vide vers `hellFx` (vue) et les nouvelles.
- Décor (`HellDecor`, construit une fois, instancié) : arbres calcinés, ronces, fleurs de feu, champignons et cristaux géants qui luisent selon la zone, cendres et cailloux au sol (même sur le chemin), crânes épars, cages et chaînes pendues au bord des parois, torches toutes les 7 rangées contre les parois, obélisques à runes à l'entrée de chaque zone, pieux à crânes devant les forteresses et la citadelle, crânes de géants dans la gorge des os, colonnes brisées sur les falaises, cascades de lave là où une paroi domine un bassin ou l'abîme, fumerolles qui crachent par moments (près de la vue), cendre qui tombe. Ses sources de lumière s'ajoutent à celles de la vue. Rien de tout cela ne bloque le passage : pur décor.
- Petites bêtes (`HellCritters`, sans lien avec la simulation) : nuées de chauves-souris de feu (`BAT_FLOCKS` par zone), charognards au-dessus des falaises, de la gorge et du royaume (`CROWS`), salamandres au bord de la lave (`SALAMANDERS`), poissons de lave qui sautent des bassins proches, feux follets dans la forêt de cristaux. Animées seulement près de la vue (placées une fois au départ).
- Bâtiments démoniaques (`siteParts(kind, zone)`) : pierre et toit propres à chaque zone, ornements de zone (lave au pied des murs aux braises et à la rivière, pierre cendrée et éboulis aux falaises, défenses et crâne de bête dans la gorge, cristaux dans la forêt de cristaux) ; leurs points de fumée et d'étincelles s'animent près de la vue (`puffSite`).
- Démons (`demonParts`, `battleUnits.ts`) : arcade, crocs, griffes aux mains et aux pieds, pagne et ceinture des petits, pointes dorsales des gros, marques de feu ; au repos, un léger souffle et les bras qui se balancent.
- Vue : `HellView.build` (sol, bassins, ponts, décor, braises, brume, portail, bâtiments démoniaques), `syncBase` habille les bâtiments du joueur selon l'âge (`hellBaseAges.ts`, un fichier par genre, `hellBaseKit.ts` en commun). Les aperçus des cartes de « Ma base » : `render/hellThumbs.ts` (`hellThumb`, source `hell` de `Thumbs`, chargée à part à la première carte) reprend les mêmes pièces (`baseAgeGeo`, `wallPartsAged` pour un court pan est-ouest, `gatePartsAged` porte fermée, drapeaux immobiles) en matériaux simples (ceux de la vue prennent la lumière des cavernes, `caveLit`), tournées d'un demi-tour (la façade regarde -z) ; `CommandHost.baseThumb` → `Thumbs.getFrom('hell', kind, âge)`. Unités : `BattleLayer` (`battleUnits.ts`).
- Sauvegarde : `WarSave.faction` (`HellSave` : temps, vague, conquêtes, bâtiments, unités démoniaques, `reinforced`), `WarSave.base` (`HellBaseSave` : échéances, compteurs, bâtiments avec vie, reprise en cours). `HellBase.load` repose les camps d'abord.
- `HellMode.addTroop` : aide du mode développeur, des unités du joueur hors armée.

## Liens avec les autres systèmes
- [portail-ile.md](portail-ile.md) : verrou d'entrée (`hellWhy`), vagues suspendues par `frontPosts`, contamination qui recule avec les zones conquises (`conqueredZones`).
- [armee-combat.md](armee-combat.md) : troupes, ordres, simulation de combat, recrutement à la caserne avancée (`recruitHell`, `recruitPlan.ts`).
- [fin-du-royaume.md](fin-du-royaume.md) : la zone 6, le roi, la citadelle.
- [ages.md](ages.md) : `ZONE_AGE` suit les âges ; un passage d'âge rouvre la brume (`War.ageUp`).
- [economie-ressources.md](economie-ressources.md) : bois, pierre, minerai du village.

## Pièges et invariants
- `Hell.age` vaut 99 par défaut (aucune limite) ; `War.update` le règle à chaque image avant tout calcul. Une `Hell` faite à la main (tests) n'a pas de plafond d'âge.
- Une zone conquise **reste ouverte** si l'âge est en retard (`frontier`) ; ne pas déduire l'ouverture de `ageCap` seul.
- Les démons d'une contre-attaque ou d'une vague sont des « raiders » (`zone = −1`) : sans poste ni laisse. À la chute d'un camp, ceux de la contre-attaque deviennent la garnison de la zone (`fall`).
- `HellBase.load` rend aux démons sans zone repris de la sauvegarde la force de la zone d'où ils viennent (`active`) ; sans cela ils reviendraient aux stats de la zone 1.
- Le front dépend de la zone la plus profonde **gardée** : un poste sans camp ni troupe n'est pas « gardé » (`troopsIn`), il sera repris.
- Le camp au seuil (zone 0) subit aussi des contre-attaques tant que rien n'est conquis, mais ne suspend pas les vagues de l'île (`frontPosts` ne compte que les zones conquises).
- Les bâtiments du joueur au combat sont des `HellBuilding` de côté `player` ; `HellBase.buildings` les reconnaît à `kind in BASE_DEFS` (la tour de garde et la caserne de l'île, aussi `player`, n'y sont pas).
- Royaume tombé (`portalOut`) : `hellWhy()` rend `null`, donc `enterHell` reste possible par le clic sur le portail (`world.portalOpen` reste vrai), alors que `sendThroughPortal`, `recruitHell` et `hellPresence` refusent. À vérifier : est-ce voulu ?
- Distance des tirs et portées : toujours du **bord** de la cible (rayon déduit), pas du centre.

## Pour modifier
- **Ajouter une zone** : `HELL_ZONES`, `ZONE_AGE`, `ZONE_ART`, `Z_*`, `HELL_ZONE_N` (tailles de tableaux : `alert`, `reinforced`, `next`, `count`), la table `FORT` de `garrisonOf`, `SPINE_R` et `CHEESE` de `HellMap`, `ZSHORT` de la frise, textes anglais (`src/i18n/en/war.ts`), tests de `enfers.test.ts`. Garder la sauvegarde lisible : les tableaux sauvegardés plus courts sont déjà tolérés (`Array.isArray`, `i < HELL_ZONE_N`).
- **Changer le coût ou la portée d'un bâtiment de base** : `BASE_DEFS` (et `SITES` pour la vie, l'armure et le tir), tuile de `baseRow`, `baseAvancee.test.ts`.
- **Ajouter un bâtiment de base** : `BaseKind` (`hell.ts`), `BASE_DEFS`, `SITES`, un fichier `hellBase<Genre>.ts` et son entrée dans `hellBaseAges.ts` (l'aperçu de sa carte suit tout seul, `hellThumb`), la tuile de `baseRow` et `BSHORT`, traduction.
- **Régler la pression du front** : constantes de `hellBase.ts` (`COUNTER_*`, `RECLAIM_*`, `FRONT_*`) ; `front.test.ts` les importe.
- **Changer l'ouverture par l'âge** : `ZONE_AGE` seul ; `zoneCapOfAge` et la frise suivent.
