# Expéditions

> Fichiers : `src/sim/missions.ts` (les missions `MISSIONS`, effets, `ExpState`), `src/sim/expeditions.ts` (classe `Expeditions` : départ, étapes, imprévus, retour), `src/sim/events.ts` (imprévus et leurs options), `src/sim/choiceStyle.ts` (Prudent / Audacieux), `src/sim/airlift.ts` (voyage en l'air), `src/render/expeditionView.ts` (fanion, suiveurs, caméra), `src/render/expeditionScenes.ts` (`ExpeditionScene` : ce que l'équipe fait sur place, 4 600 lignes), `src/render/airFleet.ts` (hélicoptère et montgolfière de transport), `src/render/festivities.ts` (fête du retour), `src/ui/ui.ts` (`openExpeditions`, `openSend`, `showDecision`, `showReport`, cartes à gauche), `src/main.ts` (`follow`, `onReport`, `festAt`).
> Tests : `tests/expeditions.test.ts`, `attente.test.ts`, `chasses.test.ts`, `maritime.test.ts`, `mer.test.ts`, `suivi.test.ts`, `styleDesChoix.test.ts`, `retour.test.ts`, `securite.test.ts`, `vehicules.test.ts`, `trophees.test.ts`, `textesCourts.test.ts`, `i18nMissions.test.ts`.
> Voir aussi : [equipement.md](equipement.md), [monde-souterrain.md](monde-souterrain.md), [ages.md](ages.md), [batiments-catalogue.md](batiments-catalogue.md), [trafic.md](trafic.md), [habitants.md](habitants.md), [fin-de-partie.md](fin-de-partie.md), [portail-ile.md](portail-ile.md), [interface.md](interface.md), [traduction.md](traduction.md), [sauvegarde.md](sauvegarde.md).

## En bref
Le joueur envoie une petite équipe d'habitants vers un lieu de la carte (plaine, forêt, rivière, mer, montagne, grotte, au-delà des collines, cosmodrome). Elle y va à pied, à cheval, en voiture, en bateau ou en l'air, travaille sur place sous les yeux du joueur, affronte un ou deux imprévus qui demandent une décision, puis revient au village qui fait la fête. L'issue (réussite ou échec) est tirée au hasard selon le risque du choix, de l'équipement emporté et des décisions prises. Les gains sont des bêtes, du minerai, des bonus de besoins, des savoir-faire durables et le droit de bâtir un bâtiment.
Une mission = plusieurs **choix** (en général deux, parfois trois, un seul pour quelques-unes). Certaines missions sont obligatoires pour passer à l'âge suivant.

## Règles du jeu

### Les missions
`MISSIONS` (`missions.ts`) : 35 missions, de l’âge 0 à l'âge 5. Une mission affichée est celle de l'âge du village ou d'un âge passé (`Expeditions.list`). Réussie, elle peut se refaire (`redoEffects`, voir plus bas).

| Âge | Missions (★ obligatoire, → bâtiment débloqué) |
|---|---|
| 0 | `herd` ★ → enclos (`pen`), `berries`, `flint`, `honey` → rucher (`apiary`), `mammoth` ★ |
| 1 | `seeds` ★, `horses` → écurie (`stable`), `fishing`, `springs` → bains (`baths`), `pugilat` → arène (`arena`), `kraken` ★, `portal` ★ → tour de garde (`watchtower`), `megalodon` |
| 2 | `mine` ★ → mine, `wolf`, `fair` → cirque, `brewer` → taverne, `dragon` ★, `caravel` ★ → chantier naval, `spice` (exige le chantier naval) |
| 3 | `railway` ★, `coal`, `motorcar` ★ → usine automobile, `flight` → aérodrome, `oil` ★ → raffinerie, `galleon` (chantier naval) |
| 4 | `summit` ★, `reef`, `stars` → observatoire, `games` (stade, football, basket, tennis, parc aquatique, ski), `trawl` (halle aux poissons) |
| 5 | `seafarm` (ferme marine), `rocket` (cosmodrome), `moon` (fusée réussie), `colony` (lune réussie, cosmodrome, fusion) |

- `Mission.requires` : `missions` (à réussir avant) et `kinds` (à avoir bâtis). Un bâtiment amélioré compte (`Expeditions.has` suit la lignée `lineOf` ; `hasFor` / `reqLine` pour les listes de plusieurs bâtiments). `Expeditions.missing` produit le texte de ce qui manque.
- `portal` ne compte comme obligatoire que si la carte a une île (`world.portal`, voir [portail-ile.md](portail-ile.md)) : `sim.ts` et `ui.ts` filtrent `m.id !== 'portal' || w.portal`, et `why` refuse le départ sans île.
- Obligatoires (`mandatoriesFor(age)`) : toutes celles de l'âge sont à réussir pour l'âge suivant (voir [ages.md](ages.md)). `isLegendary` (mammouth, ou gain d'un trophée de `LEGENDS`) et `isMilitary` (`wolf` ou un choix avec `troop`) servent aux étiquettes et aux sous-onglets de la fenêtre.
- `colony` a `farewell: true` : tout le village accompagne les colons, ils ne reviennent pas, l'issue est aussitôt un récit ; `VICTORY = 'colony'` ouvre l'écran de fin ([fin-de-partie.md](fin-de-partie.md)).

### Un choix (`Choice`)
Champs lus par le jeu : `dest` (lieu), `party` (habitants), `work` (secondes de jeu sur place), `risk` (probabilité d'échec de base), `scene` (ce qu'on voit faire), `danger` (sinon `DEST_DANGER` de `gear.ts`), `sea`, `carry` (ce qui suit l'équipe au retour : bêtes, chariot, sacs, invités, traîneau), `win` / `lose` (listes d'`Effect`), `fail` (l'échec à montrer au départ de l'équipe : orage, pirogue qui chavire…), `winText` / `loseText`.
Les champs `troop`, `mounts`, `fuel` et `ages` existent dans le type mais **aucune mission ne les emploie plus** (voir pièges). `choiceAt(c, age)` applique `ages` (libellés selon l'âge).

### Effets (`Effect`) et gains
`herd` (bêtes ramenées), `ore` (minerai du village), `need` (`food`, `water`, `jobs`, `joy` : durable, ou `days` jours), `perk` (savoir-faire durable : champs +30 % pour `seeds`, trophées, forge), `injured`, `unherd`. `applyEffects` les applique. Refaire une mission réussie : `redoEffects` retire les `perk` et limite les bonus durables à `REDO_DAYS = 4` jours.
`effectSummary` / `effectChips` les affichent (résumé du récit, pastilles de la carte).

### Risque, équipe, durée
- Risque réel affiché : `Expeditions.riskOf(c)` = `c.risk` × école ×0,7 × observatoire ×0,85 × institut de recherche ×0,8 × train du cosmodrome (`SPACE_RAIL_RISK`) × `securityK` (pompiers, police : plafond −15 %, `SECURITY_MAX`) × `rulesOf(difficulté).riskK` (×1,25 en Normal) × forge infernale (`FORGE_RISK`) ; en mer aussi phare (`LIGHTHOUSE_RISK` 0,88) et chantier naval (`SHIPYARD_RISK` 0,9).
- Avec l'équipement (`preview(c).risk`) : × `loadout.k` (voir [equipement.md](equipement.md)). En route : `chance(a)` = `riskOf × a.riskK`, borné entre 0,02 et 0,95 ; `riskK` part de `loadout.k` et se multiplie de chaque option choisie à un imprévu.
- Équipes en même temps : `partyLimit(pop)` = `min(MAX_TEAMS = 4, 1 + floor(pop / PER_TEAM = 30))`.
- Le travail avance ×1,25 si le village a une écurie (`a.t += dt * 1.25`). L'attente d'une décision est comptée en secondes réelles (`waitT += dt / speed`) : sans réponse au bout de `AUTO_DECIDE = 90`, l'équipe prend l'option la plus sûre qu'elle peut suivre (`safest`).
- Tutoriel : `lenient` = une équipe plus petite suffit (`need`).

### Choix Prudent / Audacieux (`choiceStyle.ts`)
Calculé sur les choix d'une mission, rien n'est stocké : le risque le plus bas = « Prudent », le plus haut = « Audacieux », entre les deux « Équilibré » ; un seul choix ou risques égaux : rien. L'effet affiché est vrai : « Moins de blessés » seulement si les blessés du prudent (`injuredOf`) sont strictement moindres que ceux de tous les audacieux, sinon « Plus sûr » ; « Plus de récompenses » seulement si `gainsOf` de l'audacieux dépasse celui de tous les prudents (bête, minerai, point de besoin = 1, `perk` = 2), sinon « Plus risqué ». `riskDots` : 1 point jusqu'à 0,12, 2 jusqu'à 0,22, 3 au-delà. `cardPhrase` : la phrase courte de la carte (10 mots au plus).

### Le déroulé (`Phase`)
`out` (trajet) → `work` (sur place) → `back` → `home` (fête, 4 s) → `finish`. `gather` ne sert plus qu'aux anciennes équipes (et au grand départ `farewell`).
1. **Départ** (`Expeditions.start`) : refus par `why` (déjà en route, pas d'île, il manque un bâtiment ou une mission, chevaux, carburant, équipes au maximum, pas de village, pas assez d'habitants libres), ou `lastFail` (pas de haute mer, pas assez de recrues). Il choisit la destination (`findDest`, repli `FALLBACK` : grotte → montagne → au loin → plaine), recrute (`agents.recruit`), prend l'équipement (`loadout`, retiré de `exp.gear`), équipe chacun (`Kit` : arme, armure, torche, corde, cheval, voiture) et lance `partyGo`. `a.might` (force au combat) ne sert plus qu'aux embuscades.
2. **Trajet** : à pied, `arrived` quand tous sont arrivés ou après `OUT_MAX = 480` s (bloquée : elle travaille là où elle est). Voir « Véhicules ».
3. **Travail** : `a.t` compte jusqu'à `c.work + a.extra`. À l'arrivée, `raise(a, true)` tente un imprévu « d'arrivée » ; sinon `arriveMiss`. Les imprévus suivants tombent à `nextEventAt` : 0,3, 0,55 puis 0,75 du travail. `events` = 2 si `work >= 20` et un tirage à 50 %, sinon 1. L'équipe s'arrête (`a.wait`), `onEvent` ouvre la fenêtre (`showDecision`, jeu en pause), le joueur choisit (`decide`) : `riskK *= option.risk`, `extra += option.work`, gains en plus (`bonus`), blessés, texte pour le récit.
   - Option **Attendre** (`wait`) et **éclaireur** (`scout`) : le travail est suspendu `waitTime(o)` secondes (de 4 à 12) ; `a.hold` compte à rebours. (`scout` n'est plus employé par aucun imprévu.)
   - Le tirage d'un imprévu (`events.ts` › `pickEvent`) : filtre `eventsFor` (lieu `where`, missions, scènes, âges, `arrive`, `from`, mer ou eau douce, climat chaud), jamais deux fois le même (`seen`), évite les 6 derniers (`RECENT_EVENTS`, sauvegardés dans `exp.recent`) et ceux des autres équipes ; 70 % d'imprévus propres à la mission quand il y en a.
4. **Issue** : `a.ok = rnd >= chance(a)` à la fin du travail. Chasses aux monstres (`FATED` : mégalodon, kraken, dragon) : tirée à `FATE_AT = 0,8` du travail, pour que le monstre meure ou s'enfuie sous les yeux de l'équipe.
5. **Retour** (`back`, 240 s au plus) puis `home` : fête (`main.ts` › `festAt`, `Festivities`) si réussite. `finish` : applique `win` ou `lose`, marque la mission faite, rend l'équipement (un échec en perd une pièce une fois sur deux), met les blessés au repos (durée ÷2 avec lieu de soins, ÷2 avec trousse), retire l'équipe, appelle `onReport` → `showReport` (récit, bouton pour bâtir le bâtiment débloqué). La colonie remplace le récit par l'écran de victoire.

### Déblocages
Une mission réussie qui a `unlocks` permet de bâtir ce bâtiment. Le verrou réel est `KINDS[k].reqMission` dans `catalog.ts` (14 bâtiments) ; `Mission.unlocks` ne sert qu'à l'affichage : les deux doivent rester d'accord. Les savoir-faire (`exp.perks`) donnent champs +30 %, trophées sur la place, forge infernale…

### Interface
- Bouton 🧭 → `openExpeditions(tab)` : onglets Missions / Équipement / Chemin de fer (dès l'âge 3), sous-onglets Toutes / Militaires / Légendaires, cartes triées (obligatoires et légendaires à faire, puis le reste, puis les réussies). Une carte = un bouton « Envoyer une équipe » → `openSend` : intro, puis une carte par choix (style, durée, risque en points, gains, équipement qui manque avec bouton « Fabriquer », bouton « Partir », « Détails »). La fenêtre se redessine toutes les 300 ms si le stock change (pas sous un bouton enfoncé).
- Cartes des équipes à gauche (`updateExpeditions`) : fanion de couleur (`TEAM_COLORS`), état (`Expeditions.status`), barre (`progress`), œil pour suivre à la caméra, bouton de décision si `a.wait`.

## Fonctionnement dans le code

### Données
`ActiveExpedition` (`expeditions.ts`) vit seulement en mémoire (`Expeditions.active`). `world.exp` (`ExpState`, sauvegardé) : `done`, `perks`, `herd`, `bonus`, `temp`, `clock`, `gear`, `craft`, `craftT`, `wins`, `recent`, `sea`. `riding` (chevaux partis) n'est pas sauvegardé. Lecture : `readExpState` (valeurs par défaut, anciennes sauvegardes).
`Expeditions.update(dt)` est appelé chaque image par la boucle de jeu : fabrication (`craftStep`), rente des bâtiments (`mineStep`), puis pour chaque équipe la machine d'états ci-dessus.

### Destinations
`findDest(kind, base, loose, sea, seaLen, hunt)` score des cases candidates (distance au village « idéale », hors village à 4 cases de tout bâtiment, atteignables par `findPath` sans détour démesuré) ; la grotte cherche une vraie grotte puis une faille (`w.outpostEntrance`), la mer une côte ouverte (`openSea`), la chasse en haute mer un point dégagé (`offing`, `OFFING_LEVELS` : 8 cases dégagées + marge, puis 6). Cas particuliers : `scene === 'games'` au pied du stade, `'portal'` depuis la rive en face de l'île (`portalShore`), `spaceport` au pied du cosmodrome (`padSide`). Une grotte trouvée au pied d'une paroi reste `site: 'cave'`.

### Véhicules
- Bateau selon l'âge (`boatKindFor` dans `missions.ts`) : pirogue, barque, voilier, vapeur, vedette, hydroglisseur ; galère à rames pour le portail, le kraken et le mégalodon jusqu'à l'âge 2. Modèles dans `BOAT_MAKE` (`expeditionScenes.ts`).
- Chevaux : sans troupe, un par membre tant que l'écurie en a (`mountsFor`).
- Voiture : âge ≥ 3, `motorcar` réussie, usine automobile bâtie, ni cheval ni troupe (`motor` dans `start`) ; coussin d'air (`kt.hover`) dès l'âge 5.
- En l'air (`airFor`, `airlift.ts`) : seulement vers `mountain` ou `far`, sans mer ni troupe ni `farewell`. Héliport et âge ≥ 4 : hélicoptère (`AIR.heli`, 3,2 cases/s) ; sinon aérodrome et âge ≥ 3 : montgolfière (`AIR.balloon`, 0,9 case/s). Étapes `AirLeg` : `walk` → `out` → `ground` → `fetch` → `back` → `home`. `Expeditions.airPose` donne la pose de l'appareil, `airRide` place chacun à bord, `AirFleet` (render) dessine. `helis.ts` n'est **pas** celui des expéditions : c'est l'hélicoptère et le drone de l'hôpital.

### Rendu
- `ExpeditionView.update` : un fanion par équipe (porté par le chef), `ExpeditionScene` créée dès le départ (le décor est posé avant l'arrivée), suiveurs au retour (`rebuild` : bêtes, chariot, traîneau, sacs, jongleurs ; `settle` les mène à l'enclos). Le décor s'efface (`scene.leave`) quand l'équipe est à `LEAVE_DIST = 5` cases ou après `LEAVE_T = 30` s.
- `ExpeditionScene` : le cœur de la mission est choisi par `BEHAVIOR[scene]` (`herd`, `boat`, `mine`, `gather`, `hunt`, `build`, `delve`, `watch`, `tend`…), posé dans le constructeur (une branche par comportement), animé dans `update` (`stepMembers`, `stepBoat`, `stepMonster`, `stepBalloon`, `stepRocket`, `stepRace`, `stepGames`, `stepDragon`, `stepPugilist` (le pugilat : deux par deux dans le cercle, en `ride` avec le geste `box`), `stepIsle`, `stepWorks`…), effets dans `stepFx`. Sous-modules : `floatIsles.ts` (îles flottantes), `galleon.ts` (épave et relevage).
- Imprévus joués sur la scène : `stageEvent(id)` fait correspondre l'id d'un imprévu à une fonction `stageXxx` (table `steps`) qui crée une `Staging` (objets, `step(dt)`, `leave`). La suite de l'option choisie est lue dans `a.picks`. Les échecs (`Choice.fail`) se jouent au départ de l'équipe par la même table (`rocks`, `capsize`, `scatter`, `charge`, `stings`, `blast`, `gone`, plus `storm`, `fog`, `birds`, `blizzard`).

### Suivi par la caméra
`Game.follow(id)` (`main.ts`) pose `following`. Un seul suivi à la fois : suivre une équipe efface `trainCam` et `incidentCam`, et inversement. Dans la boucle, `followPoint` (`expeditionView.ts`) donne la cible : le fanion, sinon le premier de l'équipe, et sur place un point entre le fanion et `scene.focus` (distance < 8) avec `lift` (montgolfière). La vue est lissée (`followSm`), vise un peu devant l'équipe en route et se rapproche à l'arrivée (6,5). Panoramique manuel (`cam.onPan`) ou `follow(null)` : on lâche. Depuis les Enfers ou le commandement de l'île, la vue remonte d'abord (`ensureSurface`). Le suivi sous terre (`isBelow`, `autoUnder`) ne s'active plus : voir [monde-souterrain.md](monde-souterrain.md).

## Liens avec les autres systèmes
- [equipement.md](equipement.md) : `loadout`, `dangersOf`, pièces, fabrication.
- [ages.md](ages.md) : obligatoires, conditions d'âge ; `sim.ts` ligne « expédition ».
- [batiments-catalogue.md](batiments-catalogue.md) : `reqMission`, bâtiments exigés par `requires`.
- [habitants.md](habitants.md) : `Agents.recruit`, `partyGo`, `partyAct`, `dismiss` (blessés), `equip` (`Kit`).
- [economie-ressources.md](economie-ressources.md) : minerai (`world.ore`), carburant, rente `mineStep`.
- [portail-ile.md](portail-ile.md), [fin-de-partie.md](fin-de-partie.md), [trafic.md](trafic.md) (aérodrome, héliport), [difficulte.md](difficulte.md) (`riskK`, `gearPrice`).

## Pièges et invariants
- **Une équipe en route n'est pas sauvegardée** : `ActiveExpedition` n'est pas dans `world.toJSON`. L'équipement qu'elle emporte a été retiré de `exp.gear` au départ : sauvegarder (ou recharger) pendant une expédition perd ces pièces. Bug probable, non corrigé.
- Données mortes mais gardées : `Choice.troop`, `mounts`, `fuel`, `ages`, `Mission.repeat`, `EventOption.scout`, `ActiveExpedition.targets/entry/front/ambush/might`, `Expeditions.ambushStep`, `exp.wins` (voir [monde-souterrain.md](monde-souterrain.md)). Ne pas les supprimer sans le moteur des Enfers ; ne pas en dépendre pour une nouvelle mission.
- Huit imprévus n'ont pas d'entrée dans `stageEvent` : `lunge`, `bones`, `flames`, `crossing`, `runes`, `rumble`, `flame`, `record`. La décision s'affiche, la scène ne joue rien de propre (à vérifier si c'est voulu : le commentaire de `events.ts` promet que le texte ne dit que ce qu'on voit).
- Une pièce d'équipement ou un bâtiment renommé selon l'âge : les textes passent par `nameOf` (`Expeditions`), pas par un nom figé (test « les conditions nomment les bâtiments comme à l'âge du village »).
- L'imprévu « arrive » seulement à l'arrivée ; s'il n'y en a aucun, `arriveMiss` reporte le premier au travail (avant, il était perdu avec le suivant).
- `decide` ne fait jamais reculer l'avancement : `a.t` est remis à l'échelle quand `extra` change.
- Une carte d'avant l'île du portail refuse la mission `portal` (`why`).
- Anciennes sauvegardes : `readExpState` convertit `monster` en `kraken` (+ `megalodon` si les dents sont rapportées) et marque `caravel` faite pour qui a passé le Moyen Âge sans le volet maritime.
- Fenêtre de départ : ne pas la redessiner pendant qu'un bouton est enfoncé (le clic était perdu) ; le refus s'affiche dans la fenêtre même (`failMsg`).

## Pour modifier
**Ajouter une mission de bout en bout**
1. `missions.ts` : ajouter l'objet dans `MISSIONS` (id, âge, `mandatory`, icône, titre, `intro`, `requires`, `unlocks`, choix avec `dest`, `scene`, `party`, `work`, `risk`, `win`, `lose`, textes). Un nouveau cœur de mission : l'ajouter au type `Scene`.
2. Si elle débloque un bâtiment : `reqMission: '<id>'` dans `catalog.ts`, et `unlocks` sur la mission.
3. Imprévus : ajouter dans `events.ts` (`where`, `missions` ou `scenes`, options avec `risk`, `work`, `needs`), puis une `stageXxx` dans `expeditionScenes.ts` et son entrée dans `steps` de `stageEvent`. Test `expeditions.test.ts` : chaque imprévu doit pouvoir survenir quelque part.
4. Scène : `BEHAVIOR[scene]` et la branche de construction dans le constructeur d'`ExpeditionScene` ; pour un `fail`, ajouter l'id au type `Fail` et à `stageEvent`.
5. Textes anglais : `src/i18n/en/missions.ts` et `events.ts` (test `i18nMissions.test.ts`, `textesCourts.test.ts` pour la longueur).
6. Âge : vérifier qu'une mission `mandatory` est bien comptée dans `sim.ts` (conditions de l'âge) et dans le tutoriel si besoin.

**Changer un risque ou une durée** : la valeur est dans le `Choice` ; les multiplicateurs communs dans `riskOf`. **Ajouter un véhicule** : `start` (`motor`, `air`), `Kit`, `BoatKind`/`boatKindFor`, `airlift.ts`.
