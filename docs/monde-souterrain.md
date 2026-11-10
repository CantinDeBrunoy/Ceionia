# Monde souterrain

> Fichiers : `src/world/underground.ts` (génération des galeries, zones, bassins, filons, parcours d'une troupe), `src/render/underView.ts` (la vue : relief en coupe, décor par zone, camp, gardes, patrouilles, troupes, mineurs, raids), `src/render/camp.ts` (pièces du camp par niveaux), `src/render/mobs.ts` (créatures), `src/render/caveLight.ts` (éclairage des sources), `src/sim/expeditions.ts` (`foesOf`, `ambushStep`, `isBelow`, champs de troupe d'`ActiveExpedition`), `src/world/mapgen.ts` et `src/build/tools.ts` (grottes et failles de surface), `src/main.ts` (`enterUnder`, `exitUnder`, mode `under`).
> Tests : `tests/world.test.ts` (« une partie d'avant le plan du continent garde… même souterrain »), `tests/expeditions.test.ts` (« le monde souterrain est retiré »).
> Voir aussi : [expeditions.md](expeditions.md), [equipement.md](equipement.md), [outils-terrain.md](outils-terrain.md), [enfers.md](enfers.md), [architecture.md](architecture.md), [monde-carte.md](monde-carte.md), [vegetation-biomes.md](vegetation-biomes.md), [sauvegarde.md](sauvegarde.md).

## En bref
Sous la carte de surface, un second monde de même taille (mêmes cases) : grandes cavernes, tunnels sinueux, lacs d'eau ou de lave, cristaux, champignons, filons de minerai, reliés aux entrées de surface (grottes et failles). Il avait un camp, des troupes armées, des mineurs, des patrouilles et des attaques.
**État actuel : le joueur n'y a plus accès.** Le commit « Retrait du monde souterrain côté joueur » (`e6eebb8`) a retiré le camp, les quêtes, les tunnels, l'expédition armée, le repérage, l'avant-poste et la rente du sous-sol. Aucune mission n'envoie plus une équipe sous terre (`entry` vaut toujours -1). Le moteur reste dans le code parce que le monde des Enfers en réutilise des morceaux ; on l'essaie en console avec `__game.enterUnder(case)`.
Ce fichier décrit ce moteur tel qu'il est, pour le réutiliser ou ne pas le casser.

## Règles du jeu (ce qui reste visible)
- Les grottes et failles de surface existent toujours : `mapgen.ts` en pose deux grottes au plus (espacement 30 cases, de préférence sur un versant raide) et cinq failles au plus (espacement 20, terrain plat à 6 cases de l'eau) ; l'outil « grotte » et l'outil « faille » (`tools.ts` › `applyVeg`) en posent une à la main ([outils-terrain.md](outils-terrain.md)).
- Les expéditions vers une grotte (destination `cave`) se jouent **en surface** : l'équipe va à la bouche de la grotte voisine (`world.outpostEntrance`, `VEG_CAVE`) ou, à défaut, au bord d'une faille, y entre dans la scène `gallery` ou `cave` (`expeditionScenes.ts`, bouche `caveMouthGeo`) et ressort (`partyHide`) ; on ne voit jamais les galeries.
- Dans les tests : `Underground` se génère et se relit à l'identique pour une carte d'avant le plan du continent.

## Fonctionnement dans le code

### Génération (`Underground`, `underground.ts`)
`new Underground(world)` puis `sync()` : régénère si la clé `mapId|seed|cases d'entrée` change (une grotte ou une faille posée ou rasée refait tout) ; `version` augmente alors.
`generate()` (graine = `seed * 7 + mapId * 1013`) :
1. Cavernes (« fromage », bruit `cheese > 0,17`) et tunnels (« spaghettis », deux bruits `|worm| < 0,045` et `< 0,04`) ; `BORDER = 2` cases toujours rocheuses.
2. Deux passes d'automate cellulaire (≥ 5 voisins : ouvert ; ≤ 2 : fermé).
3. Une salle de rayon 2,4 sous chaque entrée, puis `connect` : chaque poche est reliée à la plus grande par un tunnel de coût bruité (Dijkstra, `MinHeap`) ; les poches de moins de 14 cases sans entrée sont rebouchées.
4. Zones (`zone[k]`) d'après le biome de surface (domaine déformé de 6 cases) : taïga → `UZ_ICE`, désert → `UZ_MAGMA`, marais et tropiques → `UZ_LUSH`, sinon `UZ_STONE` ; magma aussi à moins de 13 cases d'un volcan ; poches `UZ_CRYSTAL` (bruit > 0,3). Noms : `UZ_NAMES` (galeries, grotte de cristal, de glace, luxuriante, cavernes de magma).
5. `walls()` : `wallDist` (distance à la paroi, jusqu'à 8). Sol ondulé (`floor`), bassins (`pool`) au cœur des grandes salles (distance à la paroi ≥ 3, à 5 cases d'une entrée) : eau (`POOL_WATER`) ou lave (`POOL_LAVA`, seulement en magma), niveau `POOL_Y` ; `settlePools` rend chaque lac tout d'eau ou tout de lave (eau à moins de 3 cases d'une lave : asséchée).
6. Cases percées par les mineurs (`world.dug`) rouvertes ; `buildVis` calcule le relief affiché (`vis`, `vOpen`, `vGround`, `vBump0/1`) à la résolution de la surface (`VS`, `VR`).
Utilitaires : `walkable` (ouverte, hors bassin), `heightAt` (mêmes triangles que le maillage), `distances`, `route(from, to)` (chemin de case en case), `reach`, `tunnel` (le plus court tunnel dans la roche), `dig(k)` (perce une case : `world.dug`, `walls` et relief refaits localement), `zoneAt`, `under(entrée)`.

### Filons et minage
`oreVeins(u, mined)` : sur les cases de galerie au pied de la roche (`wallDist === 1`, hors cases déjà minées ou creusées), 20 % de ces cases en roche (`hash2 < 0,2`), 6 % ailleurs, le minerai tiré par poids dans `ORE_KINDS` (charbon 40, fer 28, or 10, rubis 8, lapis 7, diamant 5, émeraude 2 ; rendements 1 à 5), décalé vers le précieux en magma. `world.mined` (filons abattus), `claimed` (galeries tenues), `dug`, `digs` (cases à creuser) sont des champs de `World` **ni sauvegardés ni relus** (`fromJSON` les vide).

### Troupes et embuscades
`troopRoute(u, entry, targets, front, ambush)` : chemin de la case de descente, de filon en filon (halte `MINE_HALT = 6`), jusqu'au front, avec un combat (`FIGHT_HALT = 20`) à chaque case d'embuscade ; `routeAt` donne où elle en est. Le jeu et la vue le calculent de la même façon. Côté simulation (`expeditions.ts` › `ambushStep`) : à l'embuscade, `threat = n × FOE_MIGHT × (1,25 en magma) × 0,9`, `win = might / (might + threat)` ; au tirage : propre (`clean`), sinon blessés (`hurt`, 65 % du reste : +1 blessé, risque ×1,06) ou déroute (`rout` : +2 blessés, risque ×1,2) ; seul un non-échec compte dans `exp.wins`. Côté vue : `UnderView.setTroops(list, dt)` fait marcher la troupe (`Troop`, `moveTroop`, colonne blindée moderne `moveColumn`), les créatures de l'embuscade surgissent 10 s avant (`ambushes`). `Expeditions.under` donne le moteur à la simulation ; `isBelow(a)` = `entry >= 0 && phase === 'work'`.

### Créatures
`mobs.ts` : `UnderMobs` peuple le souterrain (`populate`, graine `version * 7919 + 17`) : pour chaque espèce, une par `density[zone]` cases de galerie (hors 4 cases d'une entrée et galeries tenues), groupes à tour de rôle, plafond `MAX_MOBS = 90` ; chauves-souris (28) dans les grandes salles ; `MAX_FOES = 24` en plus pour une embuscade ; au-delà de 42 unités de la caméra elles ne réfléchissent plus.

| Espèce | Apparaît (âge) | Zones | Hostile |
|---|---|---|---|
| zombie | tous | roche, magma, glace | oui |
| squelette | tous | roche, magma, cristal, glace | oui |
| araignée géante | tous | roche, luxuriante, cristal | oui |
| slime, champignon vivant, fantôme | tous | luxuriante, cristal, glace… | non |
| gardien de pierre (golem) | ≥ 2 | roche, cristal, magma | oui |
| ver des profondeurs | ≥ 3 | roche, magma, luxuriante, glace | oui |

Les zones qui engendrent des embuscades : `FOES` dans `expeditions.ts` (roche : zombies et squelette ; cristal : squelette et araignée ; glace : squelette et zombie ; luxuriante : araignée ; magma : squelette et zombie), `LATE_FOES` (golem dès l'âge 2, ver dès l'âge 3), `foesOf(zone, age)`. Les créatures grandissent avec l'âge (`GROW`), ont des yeux luisants dès l'âge 2 (`EYES`) et des corps assombris (`DARKEN`) ; les hostiles fuient les torches.

### Camp, gardes, patrouilles, attaques
- `camp.ts` : `CAMP_LEVELS = 9` niveaux ; `PIECES` (feu, tentes, tour, barricades, forge, caserne, infirmerie, monte-charge, fonderie, donjon…) ajoutées niveau par niveau ; `campLayout(u, centre, niveau, bloqués)` pose chaque pièce sur sol dégagé, à une distance du puits (`near`), sans chevaucher ; la place d'une pièce ne change pas quand le camp grandit ; `CAMP_GUARDS = [0, 2, 4, 4, 6, 6, 8, 8, 8, 12]` gardes par niveau. `buildCamp` crée les modèles et les lumières, `stepCamp` anime feux et roue.
- `UnderView.refreshCamp` (clé niveau, version, centre, âge) reconstruit le camp ; `bases` donne les puits (le camp est sous le premier) et `campLevel` son niveau (0 : pas de camp). Gardes (`Guard`) : de poste en poste, torche au poing. Patrouilles (`Patrol`, `patrolN` donné par le jeu) : trois soldats, 0,62 case/s, vers une case du front des galeries tenues ; à l'arrivée, 45 % de chances qu'une embuscade (`foesOf`) surgisse et soit combattue (`patrolFight`).
- `setRaid(...)` : une vague d'attaque du camp, qui surgit du bord des galeries tenues, que les gardes taillent en pièces. `setMiners`, `setDigs`, `digCursor` : mineurs descendus par les trains et tunnels. **Plus aucun appelant dans `main.ts`** : seuls `setTroops` et `update` sont encore appelés.

### Éclairage (`caveLight.ts`)
Le souterrain n'a pas de soleil : seules des sources (cristaux, champignons, lave, torches, puits de jour, lanterne, lampes des troupes) l'éclairent. `caveLights` : tableaux de uniformes partagés (`MAX_CAVE_LIGHTS = 24` les plus proches de la caméra, choisies toutes les 0,25 s) ; `caveLit(matériau, clé)` ajoute le calcul au shader d'un matériau standard (une fois : `userData.caveLit`) ; `uLN` = nombre de sources actives, **0 en surface** (donc sans effet). `UnderView.leave()` et `HellView.leave()` remettent `uLN` à 0.

### Passage surface ↔ souterrain (`main.ts`)
- `enterUnder(cell)` : `fadeThrough` (écran noir « Descente sous terre… »), import dynamique de `underView` (`loadUnder`, hors du paquet principal), `under.sync()`, création de `UnderView`, `build()`, mode `'under'` (classe `body.under`), caméra : `minDist 2,4`, `maxDist 24`, `minPitch 0,95`, saut à 11 de distance sous l'entrée, `cam.handler = underInput`. Bandeau avec le nom de la zone.
- `exitUnder(cell?, auto?)` : retour à la vue de surface sauvegardée (`surfaceView`, `surfaceZoom`), `saveNow`. Sans cible, devant l'entrée empruntée.
- Suivi d'une équipe : `follow(id)` sous terre ne descend que si `isBelow(a)` (`autoUnder`) ; sinon la vue remonte. Aujourd'hui `isBelow` est toujours faux : la boucle de `main.ts` garde les branches mais elles ne se déclenchent pas.
- Les clics (`underClick`) : créature qui sursaute et détale, cristal qui tinte, puits de lumière qui ramène en surface.

### Réemploi par les Enfers
`world/hell.ts` importe `UWALL`, `ROCK_ISO`, `FLOOR_ISO`, `POOL_LAVA` d'`underground.ts` ; `hellView.ts` utilise `caveLights`, `caveLit`, `glowMaterial`, `MAX_CAVE_LIGHTS` ; `battleUnits.ts` utilise `caveLit`. Modifier ces constantes ou ce shader change aussi les Enfers ([enfers.md](enfers.md)).

## Liens avec les autres systèmes
- [expeditions.md](expeditions.md) : champs `targets`, `entry`, `front`, `ambush`, `might` d'`ActiveExpedition`, `Choice.troop`, `Expeditions.under`.
- [outils-terrain.md](outils-terrain.md) : outils grotte et faille, `VEG_CAVE`, `VEG_FISSURE` ; une entrée posée ou rasée change `Underground.sync`.
- [vegetation-biomes.md](vegetation-biomes.md) : `biomeAt` détermine les zones (donc les créatures).
- [sauvegarde.md](sauvegarde.md) : `mined`, `claimed`, `dug`, `digs` ignorés au chargement ; anciennes missions `scout` et `deep` et le plan des galeries (`perks: 'map'`) oubliés par `readExpState`.

## Pièges et invariants
- **Le souterrain doit rester déterministe** : `u.open`, `u.zone` d'une carte d'avant le plan du continent sont figés par un test (`world.test.ts`). Changer le bruit, les seuils ou le lien biome → zone change le monde d'une vieille partie, et les Enfers qui en dépendent.
- Ne pas supposer de camp ni de troupe en jeu : `campLevel`, `bases`, `patrolN` restent à leurs valeurs initiales (0, `[]`, 0).
- `UnderView` ne se construit qu'à la demande (import dynamique) : ne pas l'importer statiquement depuis `main.ts` (`import type` seulement).
- Une créature d'embuscade n'est pas retirée au repeuplement (`populate` garde celles qui combattent) ; le souterrain peut changer en plein combat.
- Un tunnel creusé n'a pas de filon (`isDug`) : le minerai se remonte en creusant.
- Le retrait du joueur est testé (`expeditions.test.ts` : aucune mission avec `scout` ou `deep`, pas de `outpost`, effets limités aux six types, `entry === -1`) : le casser fait échouer ce test.

## Pour modifier
- **Rendre le souterrain à nouveau jouable** : une mission avec `troop` (le type l'accepte), recréer l'appel de `enterUnder` (un bouton, ou la suite de `follow`), donner à `World` des champs sauvegardés pour `claimed`, `mined`, `dug`, et rebrancher `setMiners`, `setDigs`, `setRaid`, `bases`, `campLevel`, `patrolN` dans la boucle de `main.ts` ; retirer les assertions du test de retrait.
- **Changer une créature** : `SPECS` dans `mobs.ts` (densité, vitesse, âge `from`), `FOES` / `LATE_FOES` / `FOE_MIGHT` / `FOE_NAME` dans `expeditions.ts`, `MOB_NAMES` dans `underView.ts`, noms anglais dans `src/i18n/en/`.
- **Ajouter une pièce de camp** : type `CampPiece`, ligne dans `PIECES` (niveau, rayon, distance), fonction de modèle et cas dans `buildCamp`, éventuellement `SMALL`.
- **Changer une zone** : `UZ_*` et `UZ_NAMES` (`underground.ts`), couleurs `FLOOR`, `WALL`, `CRYSTAL`… et `THEMES` de décor dans `underView.ts`.
