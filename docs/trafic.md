# Trafic : véhicules, bateaux, aéronefs

> Fichiers : `src/render/traffic.ts` (charrettes puis voitures sur les routes, barques de pêche, voiliers), `src/render/transports.ts` (navires des ports, avions des aéroports, `shipRoute`), `src/render/seaTraffic.ts` (navires des chantiers navals et bateaux des halles aux poissons), `src/render/helis.ts` (hélicoptères et drones des services), `src/render/airships.ts` (dirigeables et montgolfières des aérodromes), `src/render/airFleet.ts` + `src/sim/airlift.ts` (hélicoptère et montgolfière des expéditions), `src/render/galleon.ts` (scène du galion englouti), `src/render/emergency.ts` (véhicules de secours), `src/main.ts` (les appels de `update` et `motor`)
> Tests : `tests/vehicules.test.ts`, `tests/camions.test.ts`, `tests/maritime.test.ts`, `tests/ferry.test.ts`, `tests/trottoirs.test.ts`
> Voir aussi : [routes.md](routes.md), [habitants.md](habitants.md), [chemin-de-fer.md](chemin-de-fer.md), [expeditions.md](expeditions.md), [incidents.md](incidents.md), [economie-ressources.md](economie-ressources.md), [eau-rivieres.md](eau-rivieres.md), [rendu-modeles.md](rendu-modeles.md)

## En bref
Ce sont des décors animés : ils ne produisent rien, ne coûtent rien et ne sont pas sauvegardés. Ils apparaissent selon l'âge, les bâtiments posés (écurie, usine automobile, port, chantier naval, aéroport…) et le carburant. Aucun n'a de collision ni de gameplay propre ; le jeu les lit seulement par `motor` et par les bâtiments qui les justifient.

## Règles du jeu
**Charrettes et voitures** (`Traffic`) :
- Nombre : `min(MAX_CARTS = 10, floor(nombre de cases de route / 18))`, seulement si l'âge ≥ 1, la population ≥ 8 et (une écurie `stable` existe **ou** `motor`). Sans écurie ni usine automobile, aucun véhicule sur les routes.
- Tant que `motor` est faux (`horses`) : des attelages animés (cheval, charretier, roues qui tournent, chargement par âge), **à tout âge**, même moderne. Vitesse 0,8 case/s.
- `motor` vrai : voitures (modèle selon l'âge : auto ancienne à l'âge 3, petite voiture à 4, flotte volante à 5 : voiture ×3, bus, camion). Vitesse 1,2 (âge ≤ 3) ou 1,6 (âge 4 et plus).
- `motor` = `Expeditions.cars()` : au moins une usine automobile `carworks` **et** du carburant (`world.fuel > 0`, ou ressources illimitées). Sans carburant, les voitures redeviennent des charrettes. Les autres systèmes lisent la même valeur : `helis.motor`, `emergencies.motor` (donnés par `main.ts` à chaque image). `Agents.motor` n'est pas pareil : il vaut « il y a une usine » sans condition de carburant.
- Voie de droite : décalage `LANE = 0.15` à l'axe ; les piétons marchent plus loin, sur le trottoir (`SIDEWALK = 0.37`, voir [habitants.md](habitants.md)). Ils s'arrêtent la nuit (`day = hour > 6 && hour < 21`).
- Le rond-point : `avoid` = îlots (`roads.islands`) contournés si une autre route existe.

**Barques** : une par ponton `pier` qui donne sur la mer ou une rivière (au plus `MAX_BOATS = 16`), amarrée côté eau, le pêcheur rame vers un coin d'eau voisin (1,5 à 6,5 cases), pêche, revient. La nuit, elle rentre au ponton. **Voiliers** : 5 (`MAX_SAILS`) au large, dès l'âge 2.

**Navires des ports** (`Transports`) : un navire par `harbor` d'âge 2 au moins ; il appareille, suit l'eau jusqu'au bord de la carte (`shipRoute`), rapetisse à l'horizon, revient s'amarrer. Grand port 3 × 3 : navire ×2. Le vapeur fume par sa cheminée (`funnel`).
**Avions** : un par `airport` dès l'âge 4 (global) ; plan de vol fixe (`flightPlan`) : poste, roulage, décollage, tour du pays, atterrissage, retour. Ne dépend pas de `motor`.
**Navires en mer** (`SeaTraffic`) dès l'âge 2 : chaque `shipyard` arme 2 navires (échelle 1,25), chaque `fishmarket` un bateau (0,7). Le type suit l'âge : caravelle (≤ 2), galion ou vapeur (3), cargo (4), navire à foils (5) pour les chantiers ; caravelle, galion, chalutier, hydroglisseur pour la pêche (`merchantKind`, `fisherKind`). Pas de navire si le chenal fait 12 points ou moins.

**Aéronefs** :
- Hélicoptères (`Helis`) : un par centre hospitalier non réduit (`health`, pas `small`) et deux par héliport, à condition que le bâtiment et le village soient d'âge ≥ 4 **et** `motor`. À l'âge 5 : drones à quatre soufflantes. Cycle : sur l'aire, rotor, montée, vol vers un coin du village (6 à 14 cases), vol stationnaire, retour, atterrissage, repos 25 à 65 s.
- Dirigeables et montgolfières (`Airships`) : un dirigeable amarré + 2 montgolfières par aérodrome non réduit (`aerodrome`, âge 3). Ils sortent le jour (7 h à 19 h 30) ; dirigeable : tour de rayon `ORBIT = 11`, altitude `ALT = 3.2`, vitesse 1,1 ; la montgolfière dérive avec le vent (`wind`) et redescend au bord de la carte.
- Appareils des expéditions (`AirFleet`, `airlift.ts`) : pour les destinations « montagne » et « bout du monde », l'équipe prend l'hélicoptère si un héliport existe et âge ≥ 4, sinon la montgolfière si un aérodrome existe et âge ≥ 3 (`Expeditions.airFor`). Vitesses et places dans `AIR` : hélicoptère 3,2 cases/s, 5 places ; montgolfière 0,9, 5 places. Voir [expeditions.md](expeditions.md).
- Le galion englouti (`Salvage`, `galleon.ts`) est une scène d'expédition (épave, bateau de relevage, scaphandrier), pas du trafic.

**Véhicules des services** (`Emergencies`, `emergency.ts`) : fourgon de pompiers, ambulance, voiture de police partent de leur bâtiment (portée `RANGE = 14` cases) ; attelés sans `motor`, motorisés avec, sur coussin d'air à l'âge 5 (`unitGeo`). Détails : [incidents.md](incidents.md).

## Fonctionnement dans le code
- Tous sont des vues (`render/`) sans état de sauvegarde ; `main.ts` les met à jour dans la boucle avec `gdt` (temps de jeu) : `traffic.update(gdt, hour, age, pop)`, `helis.update`, `airships.update(gdt, hour, age)`, `transports.update(gdt, age)` (appelle `sea.update`).
- `Traffic.refresh` (recensement) se déclenche quand `world.version`, l'âge, `motor` ou `floor(pop / 10)` changent : liste des routes, flotte, nombre de charrettes, barques, voiliers. Un véhicule dont le chemin contient une case qui n'est plus route repart de zéro.
- `Traffic.roadPath` : parcours en largeur sur les cases `road` (4 voisins), but tiré au hasard ; sans chemin il attend (`wait`). Les véhicules passent par `world.passPoint` (courbes des routes libres) et tournent d'au plus 3,5 rad/s.
- `Traffic` utilise des `InstancedMesh` (un par modèle de flotte). Les attelages sont des groupes animés à part (`cartRig`), supprimés au changement d'âge ou de `motor` (`dropRig`).
- `shipRoute(w, berth, fx, fz)` : exploration en largeur de l'eau navigable à partir du quai (`NAV_SHALLOW = -0.08` près du quai, `NAV_DEEP = -0.35` plus loin, ou lac), jusqu'à 70 cases (`ROUTE_MAX`), vers le bord de la carte sinon le point le plus lointain ; lissée, échantillonnée tous les 0,5. `SeaTraffic.waterNear` cherche l'eau à 9 cases (`SEARCH`) du bâtiment. Les chenaux se refont quand `visVersion` ou l'âge change (clé de `Lane`).
- `Helis.update` reconstruit les entrées par clé `id:aire:futur` ; `step` est une machine à phases `parked → spin → up → out → hover → back → down → cool`.
- `Airships.sync` détruit et recrée tout au moindre changement de `world.version` ou d'âge.

## Liens avec les autres systèmes
- Économie : `cars()` et `burning()` (`CAR_FUEL = 2` par jour et par usine) dans `Expeditions` : sans pétrole raffiné, plus de voitures ni d'hélicoptères ([economie-ressources.md](economie-ressources.md)).
- Catalogue : `stable`, `carworks`, `pier`, `harbor`, `shipyard`, `fishmarket`, `airport`, `heliport`, `aerodrome` ([batiments-catalogue.md](batiments-catalogue.md)).
- Habitants : `Agents.motor` (tracteurs et drones agricoles) et trottoirs ([habitants.md](habitants.md)).
- Expéditions : appareils qui emportent l'équipe ([expeditions.md](expeditions.md)). Mer : `SHIPYARD_RISK = 0.9`, `LIGHTHOUSE_RISK = 0.88` sur les expéditions maritimes.
- Île du portail : la galère (`isleFerry.ts`, test `ferry.test.ts`) relève du portail, pas de ce fichier ([portail-ile.md](portail-ile.md)).

## Pièges et invariants
- Règle posée par commit : « rien de motorisé avant l'usine automobile, à tout âge » (voitures, secours, hélicoptères, tracteurs, bœufs aux champs). Toute nouvelle machine doit lire `motor`.
- Le commentaire de `Traffic.motor` dit « usine bâtie » mais la valeur donnée par `main.ts` inclut le carburant ; `Agents.motor` ne l'inclut pas : les tracteurs roulent sans carburant alors que les voitures s'arrêtent (incohérence connue, à vérifier si voulue).
- Les attelages sont tous retirés quand `motor` bascule (clé du recensement) : le basculement sur manque de carburant fait réapparaître des charrettes d'un coup.
- Les voitures n'existent que s'il y a au moins 18 cases de route ; une écurie suffit à lancer des charrettes sans usine.
- `Transports` lit `this.buildings.entries.get(b.id)?.group` : un bâtiment sans modèle chargé n'a ni navire ni avion.
- `shipRoute` est utilisée aussi par `SeaTraffic` (passée par le constructeur) : ne pas la déplacer sans adapter l'appel.
- Le trafic utilise `Math.random()` sans graine : rien de déterministe, aucun test ne doit en dépendre.

## Pour modifier
- **Ajouter un modèle de véhicule** : `vehicleGeo` / `fleetGeos` dans `traffic.ts` (la flotte est répartie par `indexOf(v) % flotte.length`).
- **Changer le nombre de véhicules** : `MAX_CARTS` et le diviseur 18 dans `Traffic.refresh`.
- **Ajouter un navire d'époque** : `VesselKind`, `BUILD`, `SPEED` dans `seaTraffic.ts`, puis `merchantKind` / `fisherKind`.
- **Ajouter un aéronef de service** : suivre `Helis` (aires dans `models.ts`, ex. `HELIPADS`) ; conditionner à `motor`.
- **Changer ce qui sort la nuit** : les heures sont en dur dans `Traffic.update` (6 h à 21 h) et `Airships.update` (7 h à 19 h 30).
