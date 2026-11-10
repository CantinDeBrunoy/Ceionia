# Habitants, patrouilles et sentinelles

> Fichiers : `src/sim/agents.ts` (classe `Agents` : habitants instanciés, métiers, trajets, recherche de chemin, équipes d'expédition), `src/sim/fields.ts` (parcelles, bras des champs, engins agricoles, saisons), `src/sim/patrols.ts` (rondes dans les rues), `src/sim/sentinels.ts` (sentinelles des remparts), `src/render/folk.ts` (modèle articulé d'un habitant et ses poses), `src/render/patrols.ts` (`PatrolView` : habille patrouilles et sentinelles en soldats), `src/render/riders.ts` (cavaliers, chevaux de trait, blindés), `src/render/life.ts` (petite vie : fumées, lucioles, oiseaux ; pas des habitants), `src/main.ts` (les appels de `update`)
> Tests : `tests/patrouilles.test.ts`, `tests/sentinelles.test.ts`, `tests/trottoirs.test.ts`, `tests/champs.test.ts`, `tests/fondateurs.test.ts`, `tests/silhouettes.test.ts`
> Voir aussi : [besoins-population.md](besoins-population.md), [routes.md](routes.md), [jardins.md](jardins.md), [remparts.md](remparts.md), [expeditions.md](expeditions.md), [incidents.md](incidents.md), [armee-combat.md](armee-combat.md), [ciel-meteo.md](ciel-meteo.md), [chemin-de-fer.md](chemin-de-fer.md), [trafic.md](trafic.md), [rendu-modeles.md](rendu-modeles.md)

## En bref
La population (`Sim.pop`, un nombre) n'est pas simulée une à une. `Agents` montre une fraction d'elle en passants instanciés qui sortent des maisons, vont à leur travail ou flânent, rentrent la nuit ou sous la pluie. Les mêmes objets servent d'équipes d'expédition et de voyageurs du train. Les patrouilles et sentinelles sont une simulation à part, purement décorative.

## Règles du jeu
**Combien on en voit** (`Agents.update`) :
- `want = min(MAX_AGENTS = 90, min(MAX_SHOWN = 22, floor(pop × SHOWN)) + bras des champs + membres d'expédition)`, avec `SHOWN = 0.85 / 4` : environ un passant pour quatre à cinq habitants. Des maisons (`house`, `manor`) sont nécessaires pour en créer (`addAgent`).
- 22 % des passants sont des enfants (plus petits, ils jouent, vont à l'école le matin).
- `ABLE = 0.6` : part de la population disponible pour une expédition ou un voyage en train (`available()`).

**Emploi du temps** (`hour` = heure de jeu, 0 à 24) :
- Nuit : de 20 h 30 à 5 h 30 (`night`), **ou** quand il pleut fort (`sheltering = env.rainK > 0.6`, donné par `main.ts`) : tous rentrent (`sendHome`) et personne ne sort ; les blessés (`rest`) restent chez eux le temps de guérir.
- Heures de travail (`working`) : 7 h 30 à 12 h et 13 h 30 à 18 h. Un habitant avec un métier va à son poste avec la probabilité 0,8 (`jobDest`) ; un bras des champs à sa parcelle avec 0,9.
- Enfants, 8 h à 12 h : à l'école avec la probabilité 0,7.
- Le reste du temps (`chooseDest`) : lieux de rencontre, jardins (places libres, `gardenDest`), puits, feu, temple (on y entre), champs, ateliers, bord de forêt. Poids social 0,3 le matin, 0,7 de 12 h à 14 h 30, 0,65 après 17 h.
- Sur place : 14 à 26 s à l'ouvrage, 10 s assis ou à acclamer, 4 à 12 s sinon (`arrive`).

**Métiers** (`JOB_OF`, `assignJobs`) : un lieu de travail offre `clamp(round(jobs / 3), 1, 3)` places (`KINDS[kind].jobs[âge]`). Priorité quand il y a plus de places que d'habitants : `JOB_RANK` (pompiers, paysans, prêtres, gardes, soignants…), les paysans comptent double (`JOB_SHARE`). L'outil tenu vient de `TOOL_OF`, le geste de `JOB_ACT`. Quand un bâtiment brûle, les pompiers (rayon 30) puis les voisins (rayon 16) accourent au seau (`alert`).

**Champs** (`fields.ts`) : les « bras » (`hand`) travaillent des parcelles du printemps à l'automne ; l'hiver (`season === 3`, `fieldSeason`) ils réparent devant la grange. Nombre : `min(MAX_HANDS = 12, ceil(cases/2 × HAND_SHARE 0.35), floor(pop × HAND_POP 0.15))`. Travail selon la saison (`fieldTask`) : semer ou biner au printemps ; moissonner l'été (cueillir en cagettes dès l'âge 4) ; ramasser ou bêcher à l'automne. Engins (`machineOf`) : bœufs et chariot à foin dès l'âge 1 ; tracteur et accessoires dès l'âge 3 ; drones agricoles dès l'âge 5 (`MAX_DRONES = 3`) ; au plus `MAX_RIGS = 6`. **Sans usine automobile** (`Agents.motor` faux), l'âge des engins est plafonné au Moyen Âge (`rigAge`).

**Fondateurs** : la place du village (`gather`) posée dans un village sans maison ni habitant fait arriver 4 habitants d'un coup (`Sim.update` : `pop = 4`, à l'âge 0) ; le catalogue lui donne 4 logements, de quoi manger (8) et boire (5). Deux peuvent partir en expédition.

**Patrouilles** (`patrols.ts`) : une ronde par tour de garde ou caserne du village (hors île du portail, `GARRISONS`), 6 au plus (`PATROL_MAX`), dans l'ordre de construction. Taille : 2 soldats par tour, 3 par caserne (`patrolSize`). Rayon 10 cases (`PATROL_RADIUS`), vitesse 0,5 case/s (`PATROL_SPEED`), écart 0,3 (`PATROL_GAP`), pause au garde-à-vous de 3 à 6 s toutes les 12 à 28 s. Torche la nuit. Tenue : lancier (âge ≤ 1) sinon soldat de l'époque (`patrolRole`). Sans route à 6 cases (`ROAD_REACH`), le groupe monte la garde devant la porte.

**Sentinelles** (`sentinels.ts`) : sur chaque chaîne de remparts reliés (pans, portes, tours de garde) d'au moins `CHAIN_MIN = 3` cases : 1 sentinelle ; `CHAIN_LONG = 8` : 2 ; plus une immobile en faction sur la plate-forme de chaque tour. `SENTINEL_MAX = 12`. Vitesse 0,4 (`SENTINEL_SPEED`). Elles marchent sur le chemin de ronde à la hauteur du mur de l'âge (`WALK` dans `render/ramparts.ts`), passent sur le linteau des portes.

## Fonctionnement dans le code
- `Agents.update(dt, hour, age, sheltering, popTarget, glowNight, season)` est appelé par `main.ts` avec `gdt` ; un `Agent` est dans l'état `inside` (caché chez lui), `walking` (suit `path`) ou `doing` (s'arrête, travaille, joue). Un `timer` règle la durée.
- `refreshTargets` (quand `world.version` change) : liste des lieux de travail et de rencontre, champs, routes, lisières de forêt à moins de 12 cases d'une maison (marquage en losange, pas de comparaison case par maison : coût), parcelles, puis `assignJobs`. `refreshGardens` : places des jardins selon l'âge.
- Chemin : `findPath` = Dijkstra sur 4 voisins, coût 1 sur route, 2,8 hors route, plus 3 × dénivelé ; une marche de plus de 1,0 de dénivelé est interdite ; l'eau (mer, rivière, lac) ne se franchit que sur route (pont) ; pas de décor, pas de bâtiment (sauf lampadaire, départ et but). Garde-fou : `N × N` itérations. Budget : 4 nouveaux chemins par image (`pathBudget`). Sans chemin : l'habitant s'arrête 2 à 4 s sur place (ou rentre caché si c'est le retour).
- Marche : pas = `dt × vitesse × (route 1,1 ; hors route 0,8)`, vitesse propre 0,9 à 1,4, ×2,2 s'il court (incendie). Sur une rue pavée (âge ≥ 3, `sidewalkAt`), il longe le trottoir à `SIDEWALK = 0.37` de l'axe, du côté de son décalage `off` (`sideStep` ; même convention de côté que les véhicules). Pas de trottoir sur un pont ni avant l'âge 3. Le cap est lissé vers le point suivant.
- Cacher à l'arrivée : un bâtiment visé cache l'habitant dès qu'il en atteint la case (`targetHidden`).
- Rendu (`render`, `animateActor`) : au-delà de `FOLK_FAR = 30` cases × `detail` de la caméra, un habitant n'est qu'une silhouette instanciée (cône, tête, outil) ; en deçà, un `Folk` articulé (`makeFolk`, tenue par âge, `folkStep` selon la pose : marche, course, travail, assis, semer, faucher, porter…). Les membres d'expédition équipés gardent leur modèle (`!a.kit`). La clé de tenue : âge, enfant, paysan.
- Équipes (`recruit`, `partyGo`, `partyHide`, `partyPlace`, `dismiss`, `ride`, `equip`) : voir [expeditions.md](expeditions.md) ; le train de voyageurs et l'hélicoptère s'en servent (`mission = true`, plus de routine).
- Patrouilles : `Patrols.plan` à chaque changement de monde ; le meneur suit les cases de route (`chooseNext` : tout droit à 70 %, demi-tour à un carrefour 1 fois sur 3, jamais hors du rayon), les autres suivent sa trace (`trail`, `members`). `PatrolView` habille jusqu'à `PATROL_MAX × 3` soldats (patrouilles) et `SENTINEL_MAX` (sentinelles, graine 100) ; au-delà de 30 cases × `detail` : invisibles.

## Liens avec les autres systèmes
- Population et logement : `Sim.pop`, maisons et manoirs ([besoins-population.md](besoins-population.md)).
- Routes et ponts : chemin sur `road`, `bridgeY`, `passPoint` ([routes.md](routes.md), [eau-rivieres.md](eau-rivieres.md)).
- Météo et saisons : pluie forte = abri, `season` pour les champs ([ciel-meteo.md](ciel-meteo.md)).
- Incendies : `Agents.burning` branché sur les feux, `alert` ([incidents.md](incidents.md)).
- Remparts : `Sentinels` lit `isRampart`, `WALK`, `rampartAge` ([remparts.md](remparts.md)).
- Expéditions, train, hélicoptère : réquisition de passants ([expeditions.md](expeditions.md), [chemin-de-fer.md](chemin-de-fer.md), [trafic.md](trafic.md)).

## Pièges et invariants
- Les passants ne sont **pas** des habitants : retirer un `Agent` ne change pas `Sim.pop`. `recruit` en crée au besoin (`addAgent`) ; un membre d'équipe n'est jamais retiré (`mission`).
- Sans maison, `addAgent` ne crée rien : `recruit` renvoie `null`. Les fondateurs ont donc `pop = 4` mais aucun passant avant la première maison ; `available()` compte 2 sur 4 (`floor(4 × 0,6)`) alors qu'aucun agent ne peut partir (à vérifier : le test `fondateurs.test.ts` ne passe que par `Expeditions.why`, pas par un départ réel).
- Un obstacle posé sur le chemin remet `path` à vide : l'agent « arrive » là où il est (`arrive` cache le visé s'il avait `targetHidden`). Le commentaire parle de recalcul ; en fait il n'y en a pas (à vérifier : un habitant peut disparaître en pleine rue).
- `Agents.motor` vaut vrai par défaut (les tests voient donc des tracteurs) ; `main.ts` le remet à `counts.carworks > 0` à chaque image.
- `assignJobs` est rappelée à chaque arrivée d'un nouvel habitant (`a.job === undefined`) : garder `undefined` (pas `null`) pour « pas encore réparti ».
- Un bras des champs qui part en expédition perd sa parcelle et son rôle (`recruit`) ; au retour, simple passant.
- Les trottoirs ne changent pas la logique de chemin : décalage visuel seulement. Les sentinelles ignorent les tours dans leurs déplacements (`next` filtre `isTower`).
- `Sentinels.get role()` renvoie l'âge brut, pas un rôle : inutilisée (à vérifier avant de la supprimer).
- Performance : ne pas multiplier les `Agents` en dehors de `MAX_AGENTS` ; le Dijkstra est cher sur une grande carte, d'où `pathBudget`.

## Pour modifier
- **Ajouter un métier** : `JobKind`, `JOB_OF` (bâtiment → métier), `TOOL_OF`, `JOB_ACT`, `JOB_RANK`, et `jobs` du bâtiment dans `catalog.ts` ; un outil nouveau : entrée de `PROPS` et de `HOLD`.
- **Changer les heures** : `working`, `night` (dans `update`), `chooseDest` (école 8 h à 12 h).
- **Changer le nombre de passants** : `SHOWN`, `MAX_SHOWN`, `MAX_AGENTS`.
- **Ajouter une tenue** : `wear` / `hat` / `farmWear` dans `folk.ts` (par âge, 0 à 5), `BODY_COLS` pour la silhouette lointaine.
- **Ajouter un bâtiment à ronde** : `GARRISONS` dans `catalog.ts` (le nombre de soldats dans `patrolSize`).
- **Un nouveau comportement de groupe** : suivre `Patrols` (simulation à part, `members()` pour la vue), plutôt que d'ajouter des `Agent`.
