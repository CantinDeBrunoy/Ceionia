# Incidents

> Fichiers : `src/render/fires.ts` (classe `Fires` : incendies, extinction, cartes), `src/render/emergency.ts` (classe `Emergencies` : véhicules et équipes de secours, appels de malaise, cambriolage, feu accidentel, ronde de police), `src/render/fireEngine.ts` (modèle 3D du camion et de l'échelle, rien de logique), `src/sim/coverage.ts` (portées et couverture), `src/render/coverageView.ts` (surbrillance), `src/sim/security.ts` (effet des postes sur le risque des expéditions), `src/main.ts` (`ignite`, `incidents`, `followIncident`, `wakeVolcano`), `src/ui/ui.ts` (cartes d'incident à gauche), `src/sim/agents.ts` (`alert`, `pails` : habitants au seau), `src/sim/events.ts` (imprévus **d'expédition**, voir plus bas).
> Tests : `tests/incendies.test.ts`, `tests/camions.test.ts`, `tests/vehicules.test.ts`, `tests/couverture.test.ts`, `tests/securite.test.ts`.
> Voir aussi : [besoins-population.md](besoins-population.md) (la Sécurité et sa couverture), [trafic.md](trafic.md), [habitants.md](habitants.md), [ciel-meteo.md](ciel-meteo.md) (foudre), [outils-terrain.md](outils-terrain.md) (volcans et lave), [expeditions.md](expeditions.md), [interface.md](interface.md).

## En bref
Trois incidents de village : l'**incendie** (vraie conséquence : le bâtiment peut brûler), le **malaise** d'un habitant et le **cambriolage** (mise en scène sans conséquence sur la population ni les stocks). Les secours arrivent en véhicule, descendent, interviennent, puis repartent ; chaque incident en cours a une **carte à gauche** avec un œil pour que la caméra le suive. Ne pas confondre avec `events.ts`, qui ne contient que les imprévus tirés pendant une expédition.

## Règles du jeu

### Les incendies
**Déclencheurs** (tous passent par `Game.ignite`, `main.ts`, puis `Fires.ignite`) :
- la foudre : `atmosphere.onStrike` ; une chance sur deux si un bâtiment occupe la case touchée ;
- une bombe de lave : `eruptions.onImpact`, 30 % si `world.disasters` et si la case est occupée ;
- un feu accidentel : `Emergencies` (voir plus bas), toujours sur une maison à portée d'une caserne.
`Fires.ignite` refuse si les catastrophes sont désactivées (`world.disasters`, réglage sauvegardé, vrai par défaut), si le bâtiment est une lanterne (`lamp`) ou brûle déjà. Quand le feu prend : toast rouge « 🔥 Incendie : … », `agents.alert` (voir plus bas), son de destruction.

**Évolution d'un feu** (constantes de `fires.ts`, en secondes **réelles**) :
- `PUT_OUT = 30` : délai d'extinction par la chaîne des habitants quand il y a de l'eau à portée (`waterNear`).
- `CREW = 40` : avec une caserne à portée (`crewNear`), le feu est éteint au plus tard au bout de 40 s.
- `SPRAY_OUT = 14` : durée d'arrosage par le camion avant extinction.
- `DOUSE = 18` : eau jetée par les seaux (au plus 3 seaux à la fois × 0,6 par seconde) ; au-delà, le feu s'éteint.
- `BURN_DOWN = 70` : sans secours ni eau, le bâtiment brûle au bout de 70 s (140 s si un camion est assigné au feu) : il est **supprimé** (`world.removeBuilding`), toast « a brûlé ».
- `CREW_RANGE = FIRE_RANGE = 14` cases. « Eau à portée » : eau ou lac à ±3 cases (`World.nearWater`), ou un puits / château d'eau à 8 cases au plus.
- Si les catastrophes sont coupées pendant le feu : il s'éteint sans rien détruire.
- Les flammes (jusqu'à `MAX_FLAMES = 120`, 7 par feu) diminuent avec l'avancement (`tamed`). Une sur deux lèche le toit, les autres montent le long des murs, du dehors : `Fires.top` (branché sur `BuildingView.topOf`, le haut du modèle affiché) donne la hauteur du toit ; posées au centre à mi-hauteur, elles restaient cachées dans le modèle. La fumée part du toit. Les cartes d'incendie donnent le statut (« Le camion des pompiers arrose », « n seaux jetés », « Les pompiers accourent », « On fait la chaîne depuis le puits », « Ça brûle, pas d'eau à portée ! ») et un avancement 0 … 1.

**Habitants au seau** (`Agents.alert(cell)`) : jusqu'à 4 habitants de métier pompier (`job.kind === 'firefighter'`) à moins de 30 cases, puis jusqu'à `max(2, 6 − pompiers)` autres à moins de 16 cases (ceux qui sont dehors d'abord, puis ceux qui sortent de chez eux ou de leur atelier), accourent avec un seau. La nuit, ceux qui combattent un feu ne rentrent pas se coucher tant qu'il brûle (`Agents.fighting`). Personne ne courant vers un feu (`Agents.responders(b)` nul), `Game` relance l'appel toutes les 4 s (`fireCallT`) : sans cela, un feu pris quand tout le monde était à l'intérieur s'éteignait sur le seul minuteur `PUT_OUT`, carte « On fait la chaîne depuis le puits » affichée sans personne à l'écran. `Agents.pails(b)` donne ceux qui sont arrivés (`state === 'doing'`) : ils alimentent `Fires`.

### Les secours animés (`Emergencies`)
Condition générale : `age >= 3` (âge industriel) ; en dessous, `update` ne fait rien (les incendies existent quand même, éteints de façon abstraite par `Fires`).
- **Poste admissible** (`stationFor`) : bâtiment du bon genre (`fire`, `health`, `police`), `age >= 3`, **pas** `small` ; le plus proche à `RANGE = 14` cases au plus (distance entre coins d'origine). `dispatch` réutilise le véhicule de ce poste s'il est en ronde ou au retour, sinon en crée un autre.
- **Véhicule** : à cheval (pompe à vapeur, voiture hippomobile) tant qu'il n'y a pas d'usine automobile alimentée en carburant (`Emergencies.motor = Expeditions.cars()`) ; sinon automobile, hovercraft à l'âge 5. Vitesse : 0,9 attelé, 1,4 moteur, 1,7 à l'âge 4 et plus. Tout est recréé quand l'âge ou `motor` change. Gyrophares bleus et rouges clignotants en intervention.
- **Incendie** : tout feu de `Fires.burning` à portée d'un poste reçoit un camion. Trois pompiers : lance et second (tuyau déroulé, jet balayant la façade), hache à la porte. Fin quand le feu est éteint ou après `GIVE_UP = 60` s sur place. `Emergencies.spraying(b)` renvoie à `Fires` le temps d'arrosage (`null` : pas de camion ; 0 : en route).
- **Malaise** : toutes les 120 à 280 s de jeu (`timers.health`, premier appel à 140 s), sur une maison à portée d'un hôpital (`health`) ; deux ambulanciers, civière, soins sur place (7 s), transport. Message « 🚑 Un habitant a fait un malaise : l'ambulance arrive ».
- **Cambriolage** : toutes les 160 à 360 s (`timers.police`, premier à 220 s), maison à portée d'un poste de police ; un agent frappe, le voleur s'enfuit, l'autre le rattrape, il lève les mains, on l'emmène. Message « 🚓 Cambriolage signalé : la police arrive ».
- **Feu accidentel** (`timers.blaze`) : toutes les 300 à 600 s, sur une maison à portée d'une caserne : appelle `ignite` (donc ne fait rien si les catastrophes sont coupées).
- Un seul appel à la fois par service (hors ronde) ; les trois minuteurs ne se déclenchent que s'il y a au moins une maison (`kind === 'house'`).
- **Ronde de police** : dès l'âge 4, chaque commissariat (`age >= 4`, pas `small`) a un véhicule qui roule d'une rue à l'autre dans un carré de ±10 cases autour de lui entre deux appels.
- Malaises et cambriolages ne modifient **rien** : ni population, ni bien-être, ni stocks. Ils ne dépendent pas du réglage « catastrophes ».
- Les postes démolis ou rétrogradés (`age < 3`) rappellent leurs véhicules.

### Cartes d'incident
`Game.incidents()` = `Fires.incidents()` + `Emergencies.incidents()`. Chaque entrée : `key` (`fire:<id bâtiment>` ou `unit:<service>:<id cible>`), icône (🔥 🚑 🚓), titre, statut, avancement, position `x, z`. `ui.ts › updateExpeditions` crée une carte `.expCard.incident` par clé, dans la liste de gauche (sous les équipes d'expédition), la met à jour et la retire quand l'incident disparaît. Le bouton œil appelle `Game.followIncident(key)` : la caméra suit (`incidentCam`, recentrée à chaque image) ; sous terre ou aux Enfers, `ensureSurface` ramène d'abord à la surface. Toute autre prise en main de la caméra (déplacement, suivi d'une équipe, d'un train) lâche l'incident. Un seul suivi à la fois.
Messages : les nouvelles de `Fires.news` s'affichent en toast `danger` s'ils commencent par 🔥, sinon `info` ; celles d'`Emergencies.news` en `danger`.

### Couverture et portées (rappel)
- Jauge Sécurité : pompiers `FIRE_RANGE = 14`, police `policeRange(age) = 12 + min(5, âge)` ; voir [besoins-population.md](besoins-population.md). La santé (hôpital) n'a **pas** de portée côté besoins : seule sa capacité compte.
- Surbrillance (`CoverageView`, bouton de la fiche Sécurité) : disque et anneau verts de la portée de chaque poste, pastille orange sous une habitation qui n'a pas les deux services, rouge si aucun. Reconstruite seulement quand `world.version` change.
- Effet sur les expéditions (`security.ts`) : un poste `fire` retire 5 % du risque (10 % face aux dangers chute, eau, intempéries) ; un poste `police` 5 % (10 % face aux bêtes et monstres) ; un seul poste de chaque sorte compte ; plafond `SECURITY_MAX = 0,15`. Ne dépend ni de la distance ni de l'âge.

### Autres événements aléatoires
- **Volcan qui se réveille** (`Game.wakeVolcano`) : si les catastrophes sont actives et qu'aucune éruption n'est en cours, tous les `5 à 10` jours de jeu (`dayLen × (5 + rnd × 5)`), un volcan au hasard (`VEG_VOLCANO`) tremble 18 s (toast cliquable qui mène à lui), puis entre en éruption ; les bombes peuvent enflammer des bâtiments.
- **Imprévus d'expédition** (`events.ts`) : décisions à prendre en cours de mission (`EVENTS`, `eventsFor(ctx)`, `pickEvent`). Filtrés par destination, mission, scène, âge, mer / eau douce, climat chaud. Jamais deux fois le même par expédition ; 70 % de préférence pour ceux propres à la mission. Voir [expeditions.md](expeditions.md).

## Fonctionnement dans le code
- `Game.frame` (`main.ts`) : `fires.update(dt)` avec le **temps réel**, puis diffusion des `news` ; plus loin, `emergencies.update(gdt, sim.age)` avec le **temps de jeu**, après `emergencies.motor = traffic.motor`.
- Câblage dans le constructeur de `Game` : `fires.responder = emergencies`, `fires.pails = agents.pails`, `agents.burning = (id) => fires.burning.some(...)`, `emergencies.ignite = ignite`, `atmosphere.onStrike`, `eruptions.onImpact`.
- `Emergencies.update` : (1) rappel des postes disparus, (2) un camion par feu à portée, (3) minuteurs d'appels, (4) ronde de police, (5) boucle sur les unités : états `go → work → back` (ou `patrol`), `stepFire` / `stepHealth` / `stepPolice` mènent une `Crew` d'étape en étape, chemins par BFS sur les routes (`route`, en contournant l'îlot des ronds-points sauf s'il n'y a pas d'autre passage ; sinon on termine à pied depuis `reachNear`).
- Une cible démolie pendant l'intervention rappelle l'équipe et renvoie le véhicule au poste.
- `fireEngine.ts` fournit seulement la géométrie (`fireEngine`, `fireLadder`, `LADDER_AT`), utilisée par `unitGeo` (âge 4) et par le modèle de la caserne (`models.ts`).

## Liens avec les autres systèmes
- Véhicules et carburant : `Expeditions.cars()` ([economie-ressources.md](economie-ressources.md), [trafic.md](trafic.md)).
- Habitants animés : seaux, alerte ([habitants.md](habitants.md)).
- Sécurité : couverture et bonus de bien-être ([besoins-population.md](besoins-population.md)).
- Réglage « catastrophes » : `world.disasters` (menu des réglages, sauvegardé).
- Caméra et cartes : [interface.md](interface.md), [architecture.md](architecture.md).

## Pièges et invariants
- **Deux modèles de secours** : `Fires` éteint de façon abstraite (`CREW` 40 s) dès qu'une caserne `fire` est à 14 cases, **quel que soit son âge ou sa taille** ; `Emergencies` n'envoie un camion que d'un poste d'âge ≥ 3 et non `small`. Le camion est de la mise en scène : si l'envoi échoue (pas de route), le feu s'éteint quand même. Ne pas faire dépendre une règle du jeu de la présence du camion.
- **Temps** : `Fires` tourne en temps réel (`dt`), `Emergencies` en temps de jeu (`gdt`). En pause, les feux continuent de brûler (et peuvent détruire un bâtiment) alors que les camions sont figés ; à ×8, les camions vont 8 fois plus vite que les minuteurs du feu. **Bug probable**, à vérifier côté intention.
- **Distances** : la couverture mesure centre à centre (`sizeOf / 2`), `stationFor` et `crewNear` mesurent entre coins d'origine (`x, z`). Une maison peut apparaître « couverte » (jauge, surbrillance) sans que le poste la serve.
- La jauge compte tout poste ; les secours animés exigent `age >= 3` et pas `small` : à l'âge 1 ou 2 la couverture peut être pleine sans aucun camion (le commentaire de `crewNear` dit « guetteur, tour de guet, pompiers » mais seul `kind === 'fire'` compte).
- `Emergencies.update` rend tout de suite avant l'âge 3 : aucun malaise ni cambriolage avant l'âge industriel.
- `ignite` doit rester l'unique entrée : c'est lui qui vérifie `disasters` (test `incendies.test.ts`), exclut les lanternes et évite le double feu.
- Les clés de carte (`fire:<id>`, `unit:<service>:<id>`) servent aussi à la caméra : ne pas les changer sans suivre `incidentCam`.
- Textes en français exact (`tr`) : traductions dans `src/i18n/en/`.

## Pour modifier
- **Ajouter une source d'incendie** : appeler `Game.ignite(building)` (surtout pas `Fires.ignite` directement, pour garder alerte et son).
- **Ajouter un incident** (ex. inondation) : classe sur le modèle de `Fires` ou nouveau `Service` dans `Emergencies` (`HOME`, `unitGeo`, `step…`), une entrée dans `incidents()` avec `key`, `icon`, `title`, `status`, `progress`, `x`, `z` suffit pour la carte et la caméra ; branchement dans `Game.incidents()`.
- **Changer la fréquence des appels** : `timers` et les lignes de réarmement dans `Emergencies.update`.
- **Changer les portées** : `FIRE_RANGE` / `policeRange` (couverture) **et** `RANGE` (`emergency.ts`), `CREW_RANGE` (`fires.ts`) pour que le jeu et le décor restent d'accord.
- **Rythme des feux** : constantes en tête de `fires.ts` ; adapter `tests/incendies.test.ts`.
