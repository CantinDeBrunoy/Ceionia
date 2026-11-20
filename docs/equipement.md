# Équipement des expéditions

> Fichiers : `src/sim/gear.ts` (les pièces `GEAR`, prix, `loadout`, `gearGaps`), `src/sim/expeditions.ts` (`whyCraft`, `whyCraftAll`, `craft`, `cancelCraft`, `craftStep`, `preview`), `src/sim/missions.ts` (`ExpState.gear`, `craft`, `craftT`), `src/sim/events.ts` (options qui exigent une pièce, `needs`), `src/sim/kingdom.ts` (récompense en pièces, forge infernale), `src/sim/army.ts` (la garnison consomme les mêmes pièces), `src/ui/ui.ts` (`renderArsenal`, `gearNeedHtml`, `gearNeedDetail`, `kitHtml`).
> Tests : `tests/obsidienne.test.ts`, `tests/armesEpoque.test.ts`, `tests/equipementMele.test.ts`, `i18nEquipement.test.ts`, `securite.test.ts`, `expeditions.test.ts`.
> Voir aussi : [expeditions.md](expeditions.md), [armee-combat.md](armee-combat.md), [economie-ressources.md](economie-ressources.md), [difficulte.md](difficulte.md), [batiments-catalogue.md](batiments-catalogue.md), [traduction.md](traduction.md), [sauvegarde.md](sauvegarde.md).

## En bref
Le village fabrique des pièces d'équipement (lance, corde, torche, barque, armure…) et les garde en **réserve** (`world.exp.gear`). Au départ, chaque équipe emporte automatiquement, depuis la réserve, le meilleur de ce qui pare les dangers de son choix, complété au besoin par la pièce suivante (deux arcs et quatre lances pour six : `loadout`, une pièce sert contre un seul danger, et une pièce de plus en réserve ne fait jamais monter le risque ; avant, seule la meilleure sorte partait, et deux arcs fabriqués chassaient trois lances : le risque montait pendant la fabrication, testeurs v6) ; son risque d'échec baisse en proportion. Au retour, les pièces reviennent en réserve (un échec en perd une une fois sur deux). Aucune pièce n'est jamais obligatoire pour partir : sans équipement, le risque est seulement plus haut.
La garnison de l'île (caserne) puise dans la même réserve : voir « Liens ».

## Règles du jeu

### Les pièces (`GEAR`, `gear.ts`)
`cut` = part du risque du danger retirée quand toute l'équipe en est munie ; `per(n)` = pièces pour une équipe de n ; « dernier âge » = `last` (au-delà, la pièce est dépassée).

| Pièce (id) | Âge | Dernier âge | Prix | Atelier | Pare | `cut` | Pièces par équipe |
|---|---|---|---|---|---|---|---|
| Lance (`spear`) | 0 | 1 | 1 bois, 1 pierre* (2 bois avant le 19 nov. 2026) | non | bêtes, créatures | 0,25 | n |
| Arc (`bow`) | 1 | 1 | 4 bois* | non | bêtes, créatures | 0,38 | n |
| Épée (`sword`) | 2 | 2 | 1 minerai | oui | bêtes, créatures | 0,50 | n |
| Arbalète (`crossbow`) | 2 | 2 | 1 minerai, 3 bois* | oui | bêtes, créatures | 0,56 | n |
| Lance d'obsidienne (`obsidianSpear`) | 1 | 2 | 1 minerai, 1 bois* ; savoir-faire `obsidian` | non | bêtes, créatures ; tranchant 0,75 | 0,45 | n |
| Épée d'obsidienne (`obsidianSword`) | 2 | 2 | 2 minerai ; savoir-faire `obsidian` | oui | bêtes, créatures ; tranchant 0,7 | 0,62 | n |
| Fusil (`rifle`) | 3 | 3 | 2 minerai | oui | bêtes, créatures | 0,65 | n |
| Fusil d'assaut (`assault`) | 4 | 4 | 3 minerai, 1 carburant | oui | bêtes, créatures | 0,76 | n |
| Grenades (`grenade`) | 4 | 4 | 2 minerai, 1 carburant | oui | créatures, bêtes | 0,70 | n/2 (arrondi haut) |
| Fusil à plasma (`plasma`) | 5 | — | 4 minerai, 2 carburant | oui | bêtes, créatures | 0,86 | n |
| Corde (`rope`) | 0 | — | 2 bois* | non | chutes | 0,45 | n/2 |
| Torche (`torch`) | 0 | 2 | 1 bois* | non | noir | 0,45 | n/2 |
| Lampe frontale (`lamp`) | 3 | — | 1 minerai | non | noir | 0,60 | n/2 |
| Barque (`boat`) | 1 | — | 10 bois* | non | eau vive | 0,50 | n/3 |
| Armure (`armor`) | 2 | 4 | 2 minerai | oui | créatures | 0,60 | n |
| Armure énergétique (`energyArmor`) | 5 | — | 4 minerai, 1 carburant | oui | créatures | 0,82 | n |
| Bouclier de champ (`fieldShield`) | 5 | — | 3 minerai, 2 carburant | oui | intempéries, chutes | 0,50 | n/2 |
| Trousse de soins (`kit`) | 2 | — | 1 minerai | lieu de soins (`health`) | aucun : partout | 0,10 | 1 |

\* bois et pierre ne se paient qu'en difficulté Normal (`rulesOf(...).gearPrice`, voir `gearCost`) ; en Facile et en Bac à sable ces pièces sont gratuites. En ressources illimitées (`world.unlimited`) rien n'est jamais prélevé (`payGear`, `gearShort`).
Dangers (`Danger`) : `beast`, `fall`, `water`, `dark`, `weather`, `monster`. Un choix a ses dangers (`Choice.danger`), sinon ceux de sa destination (`DEST_DANGER` : plaine bêtes+intempéries, forêt bêtes, rivière eau, montagne chutes+intempéries, grotte noir+chutes, au loin bêtes+intempéries, cosmodrome intempéries).

### Les armes d'obsidienne (20 nov. 2026)
Demande de l'auteur : que l'obsidienne rapportée du volcan ait un vrai sens, et que la baisse du risque se voie sur la carte de l'expédition. Réussir « La pierre noire du volcan » (l'un ou l'autre choix) donne le savoir-faire `obsidian` (`exp.perks`, « les tailleurs d'obsidienne »). Sans lui, les deux pièces sont dans l'onglet Équipement, grisées au cadenas (`whyCraft` : « Débloquée par l'expédition « La pierre noire du volcan » ») ; la fenêtre de départ ne les propose pas (`gearGaps(…, perks)`, `gearKnown`). Pas de ressource nouvelle : elles se paient en minerai, celui que la mission rapporte. Rien après le Moyen Âge (décision de l'auteur).
- **Le tranchant** (`Gear.edge`) : en plus de sa part du danger (`cut`), une arme d'obsidienne multiplie le risque de **toute** l'expédition par `edge` quand toute l'équipe en est munie (`1 − (1 − edge) × part` sinon). Une part du danger seule restait invisible (le mammouth prudent passait de 22 à 20 %).
- **Effet** (Normal, ×1,25, équipe entière munie, sans bâtiment qui baisse le risque) :

  | Expédition | Avant | Avec l'obsidienne |
  |---|---|---|
  | Mammouth, pièges et fosses (lances) | 21,9 % | 14,5 % (lances d'obsidienne) |
  | Mammouth, le ravin (lances, cordes) | 32,5 % | 20,6 % |
  | Kraken, harponner (arcs, barques) | 38,5 % | 27,1 % |
  | Kraken, l'appât (arcs, barques) | 31,5 % | 22,1 % |
  | Cerf blanc, la meute (arbalètes) | 20,9 % | 19,6 % (lances) ; 12,6 % (épées d'obsidienne) |
  | Cerf blanc, l'affût (arbalètes) | 21,6 % | 14,5 % (épées d'obsidienne) |

  La lance d'obsidienne reste sous l'épée d'obsidienne (`gearPower` : part + tranchant ; l'ordre de la fenêtre de départ).
- **Ce qu'emporte l'équipe** (`loadout`) : on essaie d'emporter 0, 1, 2… armes d'obsidienne de chaque sorte, posées d'abord, le reste rangé par sa part du danger (`fill`), et l'on garde le meilleur risque. Ranger simplement par « gain » faisait parfois monter le risque quand une pièce s'ajoutait (mélange avec les armes modernes) ; ainsi une pièce de plus n'ajoute qu'un essai (`equipementMele.test.ts`).
- **Le chevalier** (et le hallebardier, qui demande aussi l'épée) prend l'épée d'obsidienne à la place de l'épée si la réserve en a (`BETTER`, `kitFrom`, `kitMissing` dans `army.ts`) : elle suffit à le recruter, il la rend s'il est annulé ou renvoyé, et il frappe `OBSIDIAN_DMG` = 1,25 fois plus fort (`troopStatsOf`, lu par `War.deploy`, `ageUp`, la puissance de l'armée ; les Enfers en mode rapide lisent `troopStats`, sans le bonus).
- Équipe à l'écran : l'épée d'obsidienne se tient comme l'épée, la lance comme la lance (`Kit.weapon`). Imprévus : elles comptent comme armes (`WEAPONS`).
- Images (20 nov. 2026) : `obsidianSpear.webp` / `obsidianSword.webp` (256 × 256, détourées) et leurs cartes `-bg.webp` (480 × 480), dans `GEAR_ART`. Faites avec GPT à partir de la lance et de l'épée existantes (pointe et éclats de verre noir aux reflets violets, épée de bois aux éclats sertis), originaux dans `.claude/maquettes-hud/gpt-exp/obsidienne/`. La carte pose l'objet sur le parchemin commun aux 16 autres (reconstitué depuis leurs cartes : il est le même partout) : 333 px au plus, haut à 60 px, ombre douce ; l'objet seul fait 236 px au plus, centré.
- Anciennes sauvegardes : `readExpState` donne le savoir-faire à une partie qui a déjà réussi la mission ; les pièces nouvelles valent 0 en réserve.

### Fabrication
- Condition (`Expeditions.whyCraft`) : âge de la pièce atteint, bâtiment `needs` présent (atelier, lieu de soins pour la trousse), de quoi payer, file non pleine (`MAX_CRAFT = 10` : le plus gros lot d'une expédition, le kraken, fait 8 pièces ; à 6, « Tout fabriquer » laissait ses barques dehors). Le prix est prélevé tout de suite ; annuler une pièce de la file le rend (`cancelCraft`).
- La file se fabrique une pièce à la fois (`craftStep`) : durée `g.time` secondes de jeu, ×1,5 avec un atelier (`has('workshop')`), ×`FORGE_CRAFT` (1,5) avec la forge infernale, ×`COAL_CRAFT` (1,25) avec les fourneaux au charbon (expédition « Prospection de charbon », `legacy.ts`). Fin de file : message « L'équipement commandé est prêt ». À vitesse ×1, une seconde de jeu est une seconde réelle (`GameTime.update` : `dt × speed`). **Le jeu arrêté** (pause, ou une fenêtre ouverte, qui arrête le jeu : voir [interface.md](interface.md)), la fabrication continue au pas du temps réel (`Game.advance` appelle `craftStep(dt)` quand `gdt` vaut 0) : on commande ses pièces dans la fenêtre des expéditions, et la file semblait bloquée (retour de l'auteur, 17 nov. 2026).
- **Durées (raccourcies le 15 nov. 2026)** : l'auteur attendait des minutes devant un équipement. Une pièce se fabrique en secondes, mais une équipe en demande une par membre (`per`) : cinq armures et cinq épées, c'était 230 s. Toutes les durées ont été divisées par cinq environ :

| Pièce | Avant (s) | Après (s) |
|---|---|---|
| Torche | 6 | 1 |
| Lance, corde, lampe | 10, 8, 8 | 2, 2, 2 |
| Arc, trousse | 14, 16 | 3, 3 |
| Épée, arbalète, fusil, grenades | 18, 20, 22, 20 | 4, 4, 4, 4 |
| Fusil d'assaut, armure | 26, 28 | 5, 5 |
| Barque, fusil à plasma, bouclier de champ | 30, 30, 32 | 6, 6, 6 |
| Armure énergétique | 34 | 7 |

  Tout l'équipement d'un choix, réserve vide, à vitesse ×1 et sans atelier (médiane / pire choix de l'âge, trousse non comptée) :

| Âge | Avant | Après |
|---|---|---|
| 0 Préhistoire | 30 s / 74 s | 6 s / 16 s |
| 1 Antiquité | 42 s / 144 s | 9 s / 30 s |
| 2 Médiéval | 40 s / 180 s | 8 s / 36 s |
| 3 Industriel | 46 s / 88 s | 10 s / 16 s |
| 4 Moderne | 16 s / 60 s | 4 s / 12 s |
| 5 Futuriste | 64 s / 124 s | 12 s / 24 s |

  Avec un atelier, un tiers de moins. Le pire cas (une pièce par membre contre deux dangers) tient en une demi-minute ; le prix (minerai, bois, pierre) reste le vrai frein.
- `whyCraftAll(ids, age)` : pour la commande d'un lot (bouton « Tout fabriquer », garnison) : tout ou rien, total du prix et place dans la file.
- L'onglet Équipement (`renderArsenal`) : une carte par pièce **de l'âge** (`gearCurrent` : ni à venir, ni dépassée) avec son illustration en fond (le bas de la carte, en verre clair, la laisse voir), réserve, en route, prix, raison du refus ; puis la file avec annulation. La grille se refait à chaque fabrication : ses images ne sont pas paresseuses (`loading="lazy"` les laissait vides un moment, la torche disparaissait après « Fabriquer », v6).

### Ce qu'une équipe emporte (`loadout`)
Pour chaque danger du choix, dans l'ordre : la pièce en stock la plus protectrice (`cut` le plus haut parmi celles qui parent ce danger, même dépassée) qui n'est pas déjà prise ; autant de pièces que `per(party)` si possible, sinon ce qui reste. Le risque est multiplié par `k = 1 − (somme des cut × part fournie) / max(1, nombre de dangers)`, puis par `1 − 0,1` si une trousse est en stock (une seule part). Une pièce qui pare deux dangers (une arme : bêtes et créatures) n'est comptée que pour le premier danger traité. `Expeditions.preview(c)` donne le résultat avant départ (équipement, chevaux, carburant, risque).
- Dépassement : une pièce plus ancienne que l'âge courant reste emportée en dernier recours (une vieille lance couvre mal le danger moderne : test « de vieilles lances… »).
- Au départ (`start`) : les pièces sont retirées de `exp.gear` et gardées dans `a.gear` ; chaque membre reçoit sa part pour l'affichage (`Kit` : arme dans l'ordre plasma > assaut > fusil > arbalète > épée > arc > lance, armure, torche, lampe, corde). Une chasse (mammouth, mégalodon, kraken, dragon) donne toujours une arme d'époque aux chasseurs (`huntWeapon(age)`). Ce partage ne change pas le risque : seul `loadout.k` compte.
- Au retour (`finish`) : tout revient en réserve ; échec : une chance sur deux de perdre une pièce au hasard (`« … perdue en route »`). La trousse emportée divise par deux la durée de guérison des blessés.
- Options d'imprévu qui exigent une pièce (`EventOption.needs`) : l'option n'est choisissable que si l'équipe en porte au moins une de la liste (`canTake`) ; le bouton est grisé sinon (« demande …, non emportées »). `events.ts` définit `WEAPONS`, `ARMORS`, `LIGHTS` (toutes les époques) : une équipe armée tient tête quelle que soit son arme.

### Ce que le joueur voit au départ (`gearGaps`)
Pour chaque danger du choix qu'aucune pièce en réserve ne couvre en entier (stock < `per(party)`), la pièce **actuelle** (`gearCurrent` : connue et pas dépassée) la plus protectrice que le village sait fabriquer (`usable` : atelier ou lieu de soins là) est proposée : « 2 barques manquent », bouton « Fabriquer · prix », « Tout fabriquer » s'il y en a plusieurs (dans la fenêtre de départ, il met en file ce qui tient et dit pourquoi le reste attend, la file pleine par exemple), lien vers la fiche dans l'onglet Équipement. Les dangers se regroupent par pièce.
Les pièces dépassées pour les expéditions (`gearObsolete`) ne sont plus montrées dans l'onglet Équipement, même si une troupe de l'âge en a besoin (`troopGearNeeded`, `army.ts`) : la caserne les commande elle-même quand une recrue en manque (barre des troupes `command.ts`, Enfers `recruitPlan.ts`).

## Fonctionnement dans le code
- État : `world.exp.gear` (`Stock` = `Record<GearId, number>`, `emptyStock`), `world.exp.craft` (file de `GearId`), `craftT` (avancement de la première pièce, secondes de jeu). Sauvegardés ; `readExpState` ignore les ids inconnus, met les nouvelles pièces à 0 et borne les stocks à des entiers ≥ 0 (une ancienne sauvegarde se charge, test `armesEpoque`).
- Données : `Gear` (`gear.ts`) ; `localize(g, ['name', 'plural', 'desc'])` lit les noms anglais dans `src/i18n/en/gear.ts` (même mécanisme pour `DANGER_NAME`, `DANGER_VS`).
- Risque : `Expeditions.riskOf(c)` (sans équipement), `preview(c).risk` = `riskOf × loadout.k`, `chance(a)` = `riskOf × a.riskK` en route (voir [expeditions.md](expeditions.md)).
- Sécurité du village : pompiers et police retirent du risque par danger (`securityK`, plafond `SECURITY_MAX` 0,15), affiché par `kitHtml` à côté de ce que l'équipe emporte ; ce n'est pas de l'équipement.
- Interface : `renderArsenal` se redessine quand `stamp` (stock, file, bois, pierre, minerai, nombre d'équipes) change, jamais sous un bouton enfoncé.

## Liens avec les autres systèmes
- [armee-combat.md](armee-combat.md) : la garnison consomme les mêmes pièces. `war.ts` donne `exp.gear` comme `stock` à `army.ts` ; `recruit` retire les pièces du kit de la troupe (`troopKit`), annuler ou renvoyer une recrue les rend.
- [portail-ile.md](portail-ile.md) et [enfers.md](enfers.md) : `claimKingdom` (`kingdom.ts`) offre `KINGDOM_GEAR` (4 épées, 4 armures, 3 trousses) et la forge infernale (`FORGE_PERK` : fabrication ×1,5, risque ×`FORGE_RISK` 0,85).
- [economie-ressources.md](economie-ressources.md) : minerai (`world.ore`), carburant (`world.fuel`), bois, pierre.
- [difficulte.md](difficulte.md) : `gearPrice` (bois et pierre payants en Normal seulement), `riskK`.

## Pièges et invariants
- Le stock de réserve n'inclut pas ce que les équipes en route portent : un affichage « en route » se calcule en sommant `a.gear` des équipes actives. **Les équipes en route ne sont pas sauvegardées** : une sauvegarde faite pendant une expédition perd leur équipement (bug connu, voir [expeditions.md](expeditions.md)).
- `gearGaps` cherche des pièces *actuelles*, `loadout` prend la plus protectrice *même dépassée* : les deux ne regardent pas le même ensemble, c'est voulu (le test « de vieilles lances… » le vérifie).
- Ne pas supprimer une pièce de `GEAR` : `readExpState` et les troupes (`TROOPS[...].gear`) y renvoient par id. Une pièce dépassée reste fabricable.
- `per(n)` des troupes armées n'existe plus que dans les données : plus aucune mission n'a de `troop`.
- La trousse n'a ni danger ni dernier âge : elle part toujours si elle est en stock, une seule par équipe.
- Les textes d'équipement passent par `tr` / `localize` ; un nouveau libellé sans traduction casse `i18nEquipement.test.ts`.

## Pour modifier
**Ajouter une pièce**
1. `gear.ts` : ajouter l'id à `GearId` et l'objet dans `GEAR` (âge, `last` éventuel, coûts, `time`, `needs`, `guards`, `also`, `cut`, `per`, `desc`). `emptyStock`, `GEAR_BY` suivent seuls.
2. Icône : clé `icon` dans `src/ui/icons.ts` (`ic(g.icon)`).
3. Traduction : `src/i18n/en/gear.ts`.
4. Si une troupe l'exige : `TROOPS` / formes d'âge dans `army.ts` ; si un imprévu l'exige : `needs` dans `events.ts` (ou l'ajouter à `WEAPONS`, `ARMORS`, `LIGHTS`).
5. Équipement visible sur l'équipe : l'ordre de `start` (`Kit`) pour une arme.
6. Test : `armesEpoque.test.ts` (âges, coûts, ancienne sauvegarde).

**Changer un prix ou une durée** : `GEAR` ; ce qui est payé en Normal seulement : `wood`, `stone` + `gearPrice` dans `difficulty.ts`. **Changer l'effet d'une pièce** : `cut` et `guards`, pas `loadout`.
