# Chemin de fer

> Fichiers : `src/sim/railway.ts` (lignes, trains, tracé de la voie, arrêts), `src/sim/freight.ts` (gares, portée, bonus, réseau), `src/build/trackEdit.ts` (éditeur de tracé), `src/render/railway.ts` (voies, trains, aperçu), `src/render/railBoost.ts` (animation des bâtiments servis), `src/main.ts` (édition d'une ligne, `followTrain`), `src/ui/ui.ts` (fiche de gare, bouton 📦 / 🧳), `src/world/world.ts` (`RailLine`, `mergeVia`, sauvegarde)
> Tests : `tests/rail.test.ts`, `tests/railBoost.test.ts`
> Voir aussi : [batiments-catalogue.md](batiments-catalogue.md), [economie-ressources.md](economie-ressources.md), [ages.md](ages.md), [habitants.md](habitants.md), [eau-rivieres.md](eau-rivieres.md), [sauvegarde.md](sauvegarde.md), [expeditions.md](expeditions.md)

## En bref
Le joueur trace des lignes de gare en gare ; la voie se pose toute seule entre deux arrêts (il peut la faire passer par des points). Chaque ligne a un seul train qui fait la navette d'un bout à l'autre. Un train de voyageurs prend quelques habitants ; un train de marchandises fait produire 75 % de plus aux ateliers voisins de ses gares. Le rail est exigé pour passer à l'âge moderne.

## Règles du jeu
**Les gares** (`KindId` : `station`, `terminal`, `maglev` ; liste `STATION_KINDS` dans `freight.ts`) :
- Gare centrale `terminal` : 3 × 3, âge 3 au moins, exige une briqueterie (`reqKind: 'brickworks'`), 30 briques (`BRICK_PRICE` dans `economy.ts`). Trois voies en cul-de-sac sous la halle (`LANES = 3`) ; les trains n'entrent et ne sortent que par l'arrière (`ends: [-1]`).
- Petite gare `station` : 2 × 2, âge 3, exige une gare centrale (`reqKind: 'terminal'`), 10 briques. Une voie, deux bouts de quai.
- Gare maglev : 2 × 2, âge 5 ; la gare centrale y évolue à l'âge futuriste (`UPGRADES` dans `catalog.ts`). Elle se comporte comme une petite gare (`stationStop`), ses lignes restent valables.
- Une ancienne gare centrale restée en 2 × 2 n'a qu'une voie : `isTerminus` exige `sizeOf(b) === 3`.

**Tracer une ligne** : fiche d'une gare › « Nouvelle ligne » (`startRailEdit`), puis clic sur les gares dans l'ordre (`railPick`). Recliquer la dernière la retire ; une gare déjà sur la ligne est refusée (pas de boucle dans une même ligne). On saisit la voie prévue pour y poser un point de passage (`TrackEditor`) ; clic sur un point sans le glisser : il disparaît. Un morceau en rouge ne passe pas : `railFinish` refuse (`trouble`). Un parcours identique à une autre ligne (mêmes arrêts, dans un sens ou l'autre) est refusé (`sameAs`) : sur une voie unique, un seul train. Pendant le tracé, le panneau `#railEdit` (`renderRailEdit`, habillage dans `src/hudTheme.css`) : parchemin à filet doré en haut au centre, le paysage de l'âge derrière le titre, le trajet dans une capsule avec un train, l'astuce en italique, et les actions sur une ligne (Retirer le dernier, Tracé auto, Annuler, puis Valider en or à droite).

**Réseau** : plusieurs lignes peuvent partager une gare (embranchements, étoile autour de la gare centrale) ; des boucles se forment avec plusieurs lignes. À la gare centrale, chaque ligne prend sa voie (celle du milieu d'abord, `LANE_ORDER = [1, 0, 2]`) ; une quatrième ligne reprend la voie du milieu (`n % LANES`) et attend son tour. 6 couleurs de ligne (`LINE_COLORS`, jamais de rouge : réservé au tracé impossible).

**Trains** (`SPEED = 1.8` cases/s, `ACCEL = 0.7`, `DWELL = 6` s d'arrêt, `BOARD_MAX = 30` s d'attente des retardataires, `WAIT_MAX = 120` s d'attente d'un quai occupé, puis il part quand même). Secondes de jeu : `Railway.update` reçoit `gdt` (le temps de jeu, vitesse ×N comprise). Longueur `TRAIN_LEN = 2.3` cases : deux locomotives, une voiture (ou un fourgon), deux wagons. Aux deux bouts de la ligne, demi-tour ; les locomotives regardent vers l'extérieur (`flip`).

**Voyageurs** : à chaque arrêt d'un train de voyageurs, avec probabilité 0,85 et si `agents.available() > 8`, 1 à 3 habitants viennent à quai et montent pour une gare plus loin (`arrive` › `call`). Ils sont cachés à bord, rendus à l'arrivée et rentrent à pied. Une gare sans case de quai praticable (`board === null`) ne prend personne.

**Marchandises** : bouton 📦 / 🧳 de la fiche de ligne (`setFreight`). Une ligne dont une gare est à côté d'un bâtiment producteur naît en marchandises (`industrial`). Un train de marchandises ne prend pas de voyageurs.

**Bonus de proximité** (`freight.ts`) :
- `RAIL_REACH = 8` : cases vides entre les deux bâtiments, d'un bord à l'autre (`gap`, la plus grande des deux distances x et z).
- `FREIGHT_BONUS = 0.75` : un bâtiment de `FREIGHT_KINDS` (briqueterie, mine, carrière, scierie `lumber`, puits `oilwell`, raffinerie) à portée d'une gare desservie par une ligne de marchandises produit ×1,75 (`railBoost`, utilisé par `Expeditions.yields` et `refining`). La gare « la plus proche » est prise (`nearest`).
- `PASSENGER_KINDS = ['spaceport']` : un cosmodrome à portée d'une gare de voyageurs réduit le risque des expéditions spatiales (`SPACE_RAIL_RISK = 0.75`) et la durée des préparatifs (`SPACE_RAIL_WORK = 0.25`, soustrait de `c.work`). Voir [expeditions.md](expeditions.md).
- Une gare compte seulement si une ligne **en service** (`l.ok !== false`, deux arrêts au moins) du bon genre s'y arrête (`servedStations`).

**Passage d'âge** : l'âge moderne exige (`reqRail`) une première ligne (`railNet().lines >= 1`) et deux gares reliées (`linked >= 2`, plus grand groupe de gares liées par le rail). Voir [ages.md](ages.md).

**Explications en jeu** : fiche d'un producteur ou d'une gare (`railStat` dans `ui.ts` : « +75 % par le rail », « Voisins à servir »), fiche de bâtiment à bâtir (`railTip`), conseil du moment (`railAgeTip`, `computeMessage` dans `sim.ts` : briqueterie, puis gare centrale, puis « posez une gare à 8 cases d'un producteur »), message d'échec d'une ligne (`Train.why`). Tous les textes passent par `tr` ([traduction.md](traduction.md)).

## Fonctionnement dans le code
- Données : `World.lines: RailLine[]` (`id`, `stops` = ids de bâtiments, `color`, `via` = cases de passage par tronçon, `freight`, `ok`), sauvegardées en `{ c, s, v, f }` avec les arrêts en rang de bâtiment et `mergeVia` pour les arrêts disparus. `linesAuto` ne sert plus à rien d'autre qu'à la sauvegarde (aucune ligne automatique n'est plus créée).
- `Railway` possède un `Train` par ligne (`trains: Map<idLigne, Train>`). `refresh` tourne toutes les 2 s (`refreshT`) ou en `force` : si la clé change (lignes, via, position/rot/âge des bâtiments, `visVersion`), elle vide `stops`, `segs`, `lanes`, attribue les voies de la gare centrale, recalcule `Stop` de chaque arrêt, vérifie chaque tronçon (`seg`) et pose `Train.why` (texte affiché) ou le démarre. Si le tracé bouge, le train garde sa place « à proportion » sur son trajet.
- `Stop` : milieu du quai `c`, axe `u`, demi-longueur `half` (0,95 petite gare, `TERM_HALF = 1` centrale), `ends` (bouts par où une voie peut partir), `board` (où attendent les voyageurs). `stopKey = id:voie`.
- Tracé (`lay`) : Dijkstra 8 voisins (`route`) sur `cost` : infini sur bâtiment, décor, volcan ; eau franchissable seulement lac ou mer peu profonde (`cellAvg > -1.7`, coût 5, c'est un pont) ; forêt +1,5, champ +3, route +1,2, pente ×5 ; dénivelé de plus de 0,9 entre deux cases : interdit. Sorties dans l'axe du quai, un morceau de chemin par point de passage, puis simplification (`clear`, coût ≤ 2,6) et lissage de Chaikin (3 passes). Un tronçon se calcule une fois pour les deux sens (`seg`, clé = deux arrêts ordonnés par id + via) ; `plan` sert l'éditeur avec un cache de 48 entrées.
- `Leg` : trajet d'un arrêt au suivant (points du quai de départ, tronçon, quai d'arrivée, dépassement `OVER = 0.3`). `step` : phases `dwell` / `run`, freinage `sqrt(2·ACCEL·reste)`. `busy` (un autre train à quai ou en route vers ce quai) et `onTrack` (un autre train sur le même tronçon, dans un sens ou l'autre) font attendre ; `WAIT_MAX` débloque.
- Rendu : `RailView.rebuild` (clé : `rail.version`, `visVersion`, âge plafonné à 5, torrents) construit un seul maillage de voie (ballast, traverses, rails, platelage aux routes, ponts avec tablier tendu d'une rive à l'autre, caténaire dès l'âge 4, butoirs aux bouts de quai sans suite, signaux). Les hauteurs (`heights`, pas `STEP = 0.15`) épousent le relief adouci. Voitures posées sur deux essieux (`place`), modèles par âge (`locoGeo` : vapeur, diesel, rame TGV dès 5). La voie dégage les arbres (`clearTrees`, rayon 0,42).
- `RailBoost` : toutes les 0,6 s, `boostedBuildings` ; les 28 plus proches de la caméra au plus (`MAX_FX`, rayon `min(70, 14 + dist·1,2)`) ont étincelles dorées et fumée ; les ateliers de marchandises ont un chariot (`MAX_CARTS = 20`). Rien la nuit (`night` > 0,5 à 0,8).
- Caméra : `Game.followTrain(line)` fixe `trainCam` ; la boucle de rendu suit `railway.trainAt` jusqu'à ce qu'on déplace la vue. Depuis les Enfers ou l'île, la vue remonte d'abord (`ensureSurface`).

## Liens avec les autres systèmes
- Habitants : `Agents.recruit`, `partyGo`, `partyHide`, `partyPlace`, `dismiss` ([habitants.md](habitants.md)).
- Économie : `Expeditions.yields`, `refining`, `spaceRail` ; briques des gares ([economie-ressources.md](economie-ressources.md)).
- Âges et conseils : `Sim.railNext`, `railNet`, `reqRail` ([ages.md](ages.md), [besoins-population.md](besoins-population.md)).
- Terrain : eau, ponts, `deckY`, `cellSlope` ([eau-rivieres.md](eau-rivieres.md)). Défricher : la voie arrache arbres et rochers sur son passage.
- Sauvegarde : champs `lines`, `linesAuto` ([sauvegarde.md](sauvegarde.md)).

## Pièges et invariants
- `Railway.refresh` doit rester appelée avec `force` après tout changement de ligne : `addLine`, `setStops`, `removeLine` le font. Une ligne relue d'une sauvegarde n'a pas encore `ok` : `railNet` et `servedStations` la comptent tant que `ok !== false`.
- Arrêt démoli : les tronçons de part et d'autre se fondent en un seul (`mergeVia`) ; moins de 2 arrêts en service : `why`, train arrêté, voyageurs rendus (`reset`).
- Même parcours qu'une ligne plus ancienne : la plus récente est mise en `why` (une seule voie).
- Un train sort d'un quai par le bout par où il est arrivé = demi-tour : `flip` inverse les voitures sans les déplacer. Ne pas l'oublier en touchant à `legOf`.
- Le dessin de la voie dépend de `used` (bouts de quai atteints par une voie) : sans lui, des butoirs apparaissent sur des voies actives.
- Les arrêts sont mis en cache (`stops`) ; la gare centrale a une entrée par voie. Appeler `stopOf(b)` sans voie donne celle du milieu (utile à l'éditeur, faux pour un train).
- Constantes inutilisées : le constructeur de `Railway` reçoit `ex`, `dayLen`, `rnd` ; seul `rnd` sert (à vérifier avant de nettoyer).
- Un `Train.why` n'est jamais traduit en cache : il est calculé avec `tr` à chaque `refresh`.

## Pour modifier
- **Changer la portée ou le bonus** : `RAIL_REACH`, `FREIGHT_BONUS` dans `freight.ts` ; les textes des fiches et du perk des gares (`catalog.ts`) citent « 8 cases » et « 75 % » en dur ; `railBoost.test.ts` et `rail.test.ts` vérifient les valeurs.
- **Ajouter un producteur servi par le rail** : l'ajouter à `FREIGHT_KINDS` (sinon `railWant` l'ignore) ; l'effet suit via `YIELD` de `economy.ts`.
- **Ajouter un type de gare** : `STATION_KINDS`, l'entrée du catalogue, un `Stop` dans `stopOf` (sinon `stationStop` par défaut), le modèle 3D, `UPGRADES` si c'est une évolution.
- **Changer la vitesse des trains** : `SPEED`, `ACCEL`, `DWELL` dans `railway.ts` ; `TRAIN_LEN` et `CARS` (rendu) doivent rester cohérents.
- **Modifier le coût du tracé** : `Railway.cost` (un seul endroit) ; l'éditeur et les trains partagent `lay`.
