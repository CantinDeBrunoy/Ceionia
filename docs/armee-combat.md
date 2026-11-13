# Armée et combats

> Fichiers : `src/sim/army.ts` (troupes, formes par âge, recrutement, soins), `src/sim/gear.ts` (pièces d'équipement), `src/sim/recruitPlan.ts` (recrutement dans les Enfers), `src/sim/hell.ts` (la simulation de combat `Hell`, communes à l'île et aux Enfers), `src/sim/hellBalance.ts` (puissance, vagues), `src/sim/command.ts` (`Command` : sélection, ordres, formation), `src/sim/war.ts` (`War` : armée au combat, passage du portail), `src/ui/command.ts` (`CommandUI` : souris, clavier, barre), `src/ui/warTips.ts` (aides militaires), `src/render/troopPortraits.ts` (portraits des cartes de troupes), `src/render/battleUnits.ts` (`BattleLayer`), `src/render/soldiers.ts` (tenues par époque), `src/main.ts` (`isleTheater`, `hellTheater`, `bindKeys`).
> Tests : `tests/troupes.test.ts`, `tests/evolutionTroupes.test.ts`, `tests/recrutement2.test.ts`, `tests/recrutementEnfers.test.ts`, `tests/voletMilitaire.test.ts`, `tests/equilibreBatailles.test.ts`, `tests/equilibreEnfers.test.ts`, `tests/armesEpoque.test.ts`, `tests/aidesMilitaires.test.ts`, `tests/guidageEnfers.test.ts`, `tests/menuIle.test.ts`, `tests/outilsBase.test.ts`.
> Voir aussi : [portail-ile.md](portail-ile.md), [enfers.md](enfers.md), [fin-du-royaume.md](fin-du-royaume.md), [equipement.md](equipement.md), [expeditions.md](expeditions.md), [economie-ressources.md](economie-ressources.md), [ages.md](ages.md), [interface.md](interface.md).

## En bref
Le village enrôle des habitants dans une garnison. Quatre troupes (soldat, archer, chevalier, cavalier) changent de nom, d'équipement et de caractéristiques à chaque âge. Elles se recrutent à la caserne de l'île (ou à la caserne avancée des Enfers), partent avec les pièces d'équipement prises dans la réserve du village, se battent sur l'île ou dans les Enfers dans la même simulation (`Hell`), et se commandent à la souris et au clavier. Un soldat abattu est soigné, jamais perdu.

## Règles du jeu
### Les troupes par âge (`TROOPS`, `troopStats`, `army.ts`)
Caractéristiques de base à l'âge d'origine de la troupe ; vie et dégâts × (1 + `AGE_K` 0,12 × âges écoulés) × l'ajustement de la forme (`adj`). Valeurs calculées (vie / dégâts / portée / cadence en s / vitesse) ; la portée est comptée du bord de la cible.

| Troupe (âge d'origine, temps de recrutement) | Âge | Forme | Équipement | pv | dég. | portée | cad. | vit. |
|---|---|---|---|---|---|---|---|---|
| Soldat (1, 20 s) | 1-2 | Soldat | lance | 110 / 123 | 11 / 12,3 | 0,6 | 1,1 | 2 |
| | 3 | Fusilier | fusil | 143 | 11,2 | 3,9 | 0,88 | 2 |
| | 4 | Fantassin | fusil | 172 | 13,5 | 4,2 | 0,83 | 2 |
| | 5 | Soldat à impulsions | fusil | 212 | 14,3 | 4,5 | 0,72 | 2,2 |
| Archer (1, 26 s) | 1-2 | Archer | arc | 65 / 73 | 8 / 9 | 5,5 | 1,4 | 2 |
| | 3 | Tirailleur | fusil | 81 | 21,8 | 8 | 2,38 | 2 |
| | 4 | Tireur d'élite | fusil | 97 | 29,4 | 9,4 | 2,03 | 2 |
| | 5 | Pilote de drones | fusil | 115 | 17,8 | 10,5 | 0,7 | 2 |
| Chevalier (2, 40 s) | 2 | Chevalier | épée, armure | 230 | 20 | 0,7 | 1,3 | 2,3 |
| | 3 | Hallebardier (×1,6 contre les grands) | épée, armure | 283 | 25,8 | 0,7 | 1,3 | 2,18 |
| | 4 | Bazooka (×1,5) | fusil, armure | 285 | 79,4 | 5,6 | 2,21 | 2,3 |
| | 5 | Exo-lanceur (×1,4) | fusil, armure | 375 | 103,4 | 7 | 1,95 | 2,3 |
| Cavalier (1, 34 s) | 1-3 | Cavalier | lance + cheval | 150 / 168 / 186 | 16 / 17,9 / 19,8 | 0,8 | 1,2 | 3,2 |
| | 4 | Char | fusil, armure | 326 | 21,8 | 4,4 | 1,8 | 3,04 |
| | 5 | Char antigrav | fusil, armure | 533 | 35,5 | 6,4 | 1,92 | 3,2 |

- Le chevalier se recrute dès l'âge 2 (`TROOPS.knight.age`), les trois autres dès l'âge 1. Les formes sont dans `forms` ; `troopForm(kind, age)` prend la dernière dont `from ≤ âge`.
- « Grandes créatures » (`BIG` dans `hell.ts`) : brute, démon-chef, gardien, roi, garde d'élite. Le bonus `big` ne s'applique pas aux bâtiments ni aux autres démons (golem, cornu, seigneur, titan n'en sont pas).
- Une portée > 2 est une attaque à distance (événement `shot`, vue : flèche, balle, roquette) ; ≤ 2 : corps à corps.
- Les démons : `DEMONS` (`hell.ts`), puissance `DEMON_POWER` (diablotin 12, archer 14, brute 34, chef 54, golem 66, cornu 108, seigneur 169, titan 279, gardien 95, roi 171). La puissance `powerOf` = √(vie × dégâts / cadence).

### Équipement et armes d'époque
- Chaque troupe prend **une de chaque pièce** de sa forme (`troopKit`) dans la réserve du village (`world.exp.gear`), sauf en bac à sable (`world.unlimited`). Le cavalier prend aussi un cheval d'une écurie (`penHerds`, `exp.riding`) : même en bac à sable, il faut un cheval libre.
- Pièces (`gear.ts`, voir [equipement.md](equipement.md)) : lance (âge 0), arc (1), épée (2, atelier), fusil (3, atelier), armure (2, atelier). Les formes des âges 4 et 5 réutilisent le **fusil** et l'**armure** (le fusil d'assaut, le fusil à plasma et l'armure énergétique ne servent qu'aux expéditions). `last` d'une pièce n'empêche pas sa fabrication : les troupes en ont encore besoin (`troopGearNeeded`).
- Un passage d'âge change la forme sans rien rendre : `War.ageUp` remet à jour la vie et les statistiques des unités au combat (`ageUp` de `army.ts` garde la proportion de blessure) ; l'équipement déjà pris est conservé tel quel dans `Troop.gear`.
- Rendu : `troopLook(kind, age)` (`battleUnits.ts`) choisit le rôle et l'époque (lancier jusqu'à l'âge 2, puis fusilier ; archer puis tireur ; chevalier ; cheval, char, char antigrav) ; `soldiers.ts` dessine les tenues (légionnaire, chevalier, soldat napoléonien, militaire moderne, exo-armure) ; taille `TROOP_K` (soldat 1,6, archer 1,5, chevalier 1,85, cavalier 1,5 fois les habitants).

### Recruter
- À la caserne de l'île, onglet Recruter de « Ma garnison » (`isleRow`) : `War.recruit` → `army.recruit`. Refus (`recruitWhy`, dans l'ordre) : âge trop bas ; cavalerie sans écurie ; aucune caserne (`War.barracks()` : casernes de l'île, du village si l'île en a une, et casernes avancées des Enfers hors guerre finie) ; garnison au complet ; village trop petit ; pas de cheval ; pièce manquante.
- Places : `troopCap(casernes, âge)` = casernes × (4 + 2 × max(1, âge)) (6 par caserne à l'âge 1, 14 à l'âge 5), et au plus un habitant sur `POP_SHARE` = 4 (`armyCap` = min des deux). `armySize` compte les troupes et les recrues en route.
- La recrue part en galère (`Recruit.left` = durée de `TROOPS`, secondes de jeu) ; autant de recrues avancent à la fois que de casernes (`stepArmy`). Arrivée : une `Troop` valide, vie pleine, déployée devant la caserne (`War.deploy`).
- Il ne manque que l'équipement : un clic fait fabriquer les pièces à l'atelier du village (`gearToCraft`, tout ou rien, `craftCheck`), la recrue est mise en attente (`CommandUI.waiting`) et part dès que tout est prêt (`stepWaiting`, appelé à chaque `render`), ou renonce si une autre condition tombe.
- Aux Enfers (`recruitHell`, `planHellRecruit`, `orderHellRecruit`) : il faut une caserne avancée ; la recrue arrive au camp (`at: 'hell'`) en 75 % du temps ; trois issues d'un clic : `ready` (pièces en réserve), `craft` (l'atelier ou, à défaut, la forge de la base contre `SMITHY_ORE` = 4 minerai par pièce), `off` (raison dite ; si c'est la caserne, le bouton propose de la poser).
- `dismiss` et `cancelRecruit` (`army.ts`) rendent l'équipement et le cheval mais **aucun écran ne les appelle** pour le moment : seuls les tests s'en servent.

### Commander
Théâtre `isle` (île) ou `hell` (Enfers), même `CommandUI`. Souris :
- Clic : choisir une troupe (double-clic sous 320 ms : toutes celles de la même sorte **à l'écran**, Maj : ajouter). Glisser (plus de 6 px) : cadre de sélection. Bouton « Tous » : toute l'armée du théâtre, la vue se centre et recule pour la montrer. Cartes de la barre : « choisis / total », nom de l'âge, barre de vie.
- Clic droit (appui long de 450 ms au doigt) : sur un ennemi, l'attaquer (`foeAt`, 0,5 case) ; ailleurs, y aller en formation ; sur le portail : passer de l'autre côté (`PORTAL_REACH` = 2,6). Clic gauche sur le portail de l'île sans unité dessous : va aux Enfers.
Clavier (`CommandUI.key`, pris avant les raccourcis du village) : `A` puis clic (attaquer en marchant), `H` (tenir), `R` (se replier vers le portail ou le camp), chiffres 1 à 5 (rappeler un groupe, deux fois : centrer ; Ctrl, Maj ou ⌘ + chiffre : former le groupe), `Espace` (pause active : on donne des ordres, le temps est arrêté), `G` (porte pendant le tracé d'un mur), Échap (dans l'ordre : lâcher le bâtiment ou le mur, désarmer, désélectionner, puis retourner au village depuis l'île, ce qui range l'interface de l'île ; aux Enfers il ne quitte pas).
Ordres (`Hell.order`, `HellOrder`) :
- `move` : marche sans combattre (arrêt à moins de 0,6 case du but ; un but inatteignable annule l'ordre) ; `attack` + cible : jusqu'à la mort de la cible puis reprise de l'ordre sur le point ; `attack` + point : on combat ce qu'on croise (`chase`) ; `hold` : frappe ce qui est à portée (`range + 0,05`) sans bouger ; `retreat` : vers `rally` (devant le camp ou la caserne), allure ×1,15, sans combattre.
- Sans ordre (`idle`), une unité attaque l'ennemi en vue (`sight`) : elle poursuit.
- Formation (`formation`, `SPACING` = 0,75 case) : `cols = ceil(√(1,6 n))`, rangs face à la direction de marche ; les unités à courte portée devant (tri par portée croissante).
- Passage du portail (`War.sendThroughPortal`) : les unités marchent jusqu'à moins de 3,2 cases du but (devant l'arche côté île, point d'arrivée côté Enfers) puis changent de monde (`cross`, `Troop.where` : `isle` ou `hell`).

### Soins
- Une troupe abattue (`wound`) est ramenée blessée : `HEAL_TIME` = 60 s à la caserne de l'île, 30 s à l'infirmerie de la base avancée (même si elle est tombée aux Enfers sans infirmerie, elle rentre sur l'île). Soins × 1,5 avec un lieu de soins au village (`sim.counts.health`, `stepWar`). Elle revient à pleine vie, redéployée.
- Blessures légères : `REGEN` = 2 pv/s hors incursion, sur l'île, × `healBoost` (zone purifiée) ; dans les Enfers, camp 2 pv/s et infirmerie 6 pv/s à 9 cases, hors combat.

### Aides militaires (`warTips.ts`)
Huit bulles facultatives, une à la fois, une fois chacune (`ceionia.aidesMilitaires`) : `portal`, `isle`, `garrison`, `orders`, `hell`, `ageLock`, `base`, `kingdom`, testées dans l'ordre `kingdom` → `portal`. Elles se taisent pendant le tutoriel, une fenêtre, une cinématique ou si les aides sont masquées (`ceionia.aides`). 2 s d'attente au début, 3 s entre deux bulles ; 100 caractères au plus (`WAR_TIP_MAX`) ; un clic mène au bon endroit. `main.ts › warTipState` fournit l'état.

## Fonctionnement dans le code
- **Données** : `Army` { `troops`, `queue`, `nextId` } ; `Troop` { `kind`, `hp`, `maxHp`, `where`, `gear`, `mount`, `heal` (s de soins restantes), `x`, `z` } ; `Recruit` { `kind`, `left`, `at`, `gear`, `mount` }. Sauvegarde : `readArmy` (champs abîmés ignorés, équipement manquant : celui de la troupe d'origine).
- **Troupe ↔ unité** : `War.unitOf` (id de troupe → `HellUnit`) et `troopOf` (l'inverse). `War.update` déploie chaque troupe valide sans unité (`deploy`) dans la simulation de son monde (`isle.sim` ou `faction`), retire celles qui sont blessées ou disparues, relève vie et position dans `Troop` à chaque image. Un décès (`death` du joueur) devient `wound` (`War.collect`).
- **Pas de combat** (`Hell.step(dt)`) : refroidissements ; pour chaque unité vivante, `thinkDemon` (poste, laisse, alerte, patrouille ; un « raider » de zone −1 fonce sur la défense la plus proche) ou `thinkPlayer` (ordre) ; `separate` (deux passes, distance minimale (r₁ + r₂) × 1,2 + 0,04, le plus lourd bouge moins) ; `thinkBuilding` (tours : cible la plus proche à portée ; forges) ; les morts sont retirés après `DEAD_LIFE` = 2 s.
- **Coup** (`fight`, `strike`, `damage`) : à portée (écart bord à bord ≤ `range`) et refroidissement écoulé, le coup porte **tout de suite** (pas de temps de vol, les flèches de la vue sont décoratives). Dégâts = `dmg` × `boost` (forge de la base, contamination) × `big` ; une unité reçoit × `guard` (forge) ; un bâtiment retranche son armure (minimum 1). Les cibles : `nearestFoe` (la plus proche en vue, avec un malus de 0,4 par assaillant déjà sur elle à moins de 4 cases : la mêlée s'étale) ; une unité frappée se tourne vers son agresseur si rien n'est au contact. Une cible hors d'atteinte est laissée 4 s (`blocked`).
- **Déplacement** (`moveTo`) : ligne droite si libre (moins de 12 cases), sinon chemin de cases (`route`, 4 voisins), recalculé au plus 2 fois par seconde quand le but change de case, virages coupés (`cellClear`), glissement le long des obstacles. Hors d'atteinte : `false`, l'ordre tombe.
- **Interface** : `CommandUI.render()` (appelé 4 fois par seconde et à chaque action) reconstruit le HTML de la barre seulement si la chaîne change (`barKey`). `frame()` (chaque image, Enfers) place le marqueur d'objectif. `Theater` fait le pont entre l'écran et la carte (`pick`, `screen`, `focus`, `atPortal`, `ghost`).
- **La barre du bas** (`#troopBar .tfoot`, styles « la barre du bas, la même sur l'île et dans les Enfers » de `style.css`) : une rangée d'environ 170 px, la même famille sur l'île (`.tisle`) et dans les Enfers (`.thell`), peinte crème et or comme les fenêtres de l'accueil (`.cePop`). Le choix en cours (troupe choisie, bâtiment en main, onglet ouvert, outil en main, Aide ouverte) prend l'or chaud (`#f6c35a` → `#e39a2f`) et sa lueur ; aucun bleu.
  - **Disposition** (la même sur l'île et dans les Enfers, calquée sur la barre du village : trois panneaux séparés, menu centré de 820 px au plus, comme `#dockRow`) : à gauche le petit panneau des modes (`toolDock(isle)`, `.ttool` : « Bâtir » et « Recruter » en gros boutons, `tabs`, le mode ouvert en or ; dessous les outils : choisir, et aux Enfers déplacer / démolir) ; au milieu le contenu du mode en cartes (`isleRow` « Ma garnison » sur l'île, `baseRow` « Ma base » aux Enfers, ouverte d'emblée : plus de tiroir ni de bouton « Ma base ») ; à droite le coin `.tcorner` : « ? » Aide, puis les passages (île : « Envoyer aux Enfers » et « Voir les Enfers » de `passDock`, en boutons ; Enfers : « Renforts +n » de `hellLinks`), puis « Retourner au village ». La bulle d'aide (`.tbub`) est une fine bande de parchemin posée au-dessus du panneau de gauche. Chaque onglet Bâtir montre aussi, grisés et inactifs, les bâtiments de l'autre théâtre (`farTiles` : la base avancée sur l'île, les défenses de l'île aux Enfers ; cadenas, raison en infobulle). Pas de mini-carte en bataille.
  - **Les cartes** : carte de recrue (`troopCard`, `.trb.rh.trc`, 152 × 108 : portrait en pied à gauche `.tpo`, nom, rôle en pilule `troopRole` ; en pied `troopCost` : 👥 1 place, une de chaque pièce avec son image `icons/gear/{id}.webp`, 🐎 pour le cavalier, ⏳ durée (× 0,75 aux Enfers) ; refus : carte grisée avec un cadenas discret (`.tlock`), la raison en infobulle ; à fabriquer : pilule ambrée 🛠, bord pointillé). Carte de bâtiment (`.trb.tbv`, 116 × 108 ; 106 × 98 sous 1 100 px, 94 × 104 sous 720 px : l'aperçu 3D en tête `.tic.tpv`, nom sur deux lignes au plus, coût ou état en pied ; familles séparées d'un filet, leur nom en infobulle). Mêmes cartes de recrues sur l'île et dans les Enfers.
  - **Aperçus des cartes de bâtiments** (`CommandUI.preview`) : la vignette 3D de `Thumbs` (celle de la barre de construction du village, [rendu-modeles.md](rendu-modeles.md)) : défenses de l'île par `CommandHost.defenseThumb(kind, âge)`, base des Enfers par `CommandHost.baseThumb(kind, âge)` (source `hell`, `render/hellThumbs.ts`). Pas prête : le picto dans le même médaillon (`.tic[data-th="d:kind:âge"]` ou `b:…`), noté dans `thumbWait` avec son HTML exact. `Game.frame` rend une vignette par image (`thumbs.pump()`) puis appelle `CommandUI.thumbsReady()` : le médaillon est remplacé sur place et le même remplacement est fait dans `barKey`, si bien que le `render` suivant ne voit aucun changement (pas de reconstruction de la barre, pas de clignotement). Les demandes de ces cartes passent dans la file prioritaire de `Thumbs`, de gauche à droite.
  - **Au-dessus de la rangée** : les troupes sur le terrain (`.tbot`, seulement s'il y en a : une carte par sorte, portrait en médaillon `.ti`, « choisis / total », nom, barre de vie, « Tous » collé à droite) ; centrées sur l'île, à droite dans les Enfers.
  - **Portraits** (`render/troopPortraits.ts`, `troopPortrait` passé par `CommandHost.portrait`) : le modèle de la bataille (`troopLook`, `makeSoldier` / `makeRider` / `makeHoverTank`, pose de garde), rendu de trois quarts face sur fond transparent par un seul petit `WebGLRenderer` hors écran (168 × 224, lumière douce, matériaux simples à la place de `mats.body` / `mats.glow`, qui portent neige, eau et lumières de nuit), un par sorte et par âge (`portraitKey` : `soldier-1` … `cavalry-5`, le chevalier dès 2), un par moment de répit (`requestIdleCallback`), gardé en URL `blob:`. Le moteur est libéré 10 s après la file vide et refait au besoin. Tant qu'un portrait n'est pas prêt (ou sans WebGL), la carte garde le picto en grand médaillon. Un dessin `public/troops/{clé}.webp` déclaré dans `TROOP_ART` remplace le rendu (168 × 224 conseillé, fond transparent, en pied). Le pilote de drones est rendu sans ses drones.
  - **Écrans** : sous 1 100 px la rangée se tasse (160 px), la bulle passe au-dessus à gauche et les troupes au-dessus à droite ; sous 900 px, Aide et le retour n'ont plus que leur picto (texte en infobulle) ; sous 720 px, une ligne (passage en pilule, Aide et retour en pictos), puis le menu (aux Enfers, onglets et outils en petite grille à sa gauche), bulle et troupes au-dessus sur toute la largeur ; les rangées de cartes défilent en interne, jamais la page. La bulle facultative `#warTip` (`warTips.ts`) garde sa place en haut à droite, même coque crème.
- **Vue** : `BattleLayer` (un maillage instancié par pièce et par sorte de démon, plafonds `CAP`, barres de vie `BARS`, cercles de sélection `RINGS`), partagé par l'île et les Enfers ; `update(dt, camera, events)` joue les événements de combat (`isleFx` ou `hellFx`, vidés par la vue ; bornés à 400 quand on ne regarde pas).

## Liens avec les autres systèmes
- [equipement.md](equipement.md) / [expeditions.md](expeditions.md) : l'atelier fabrique les pièces ; les expéditions partagent la réserve (`exp.gear`) et les chevaux (`exp.riding`).
- [portail-ile.md](portail-ile.md) : taille des vagues selon la puissance de l'armée ; défenses de l'île au combat.
- [enfers.md](enfers.md) : base avancée (soins, forge, caserne), zones, renforts ennemis proportionnés au joueur.
- [fin-du-royaume.md](fin-du-royaume.md) : récompenses d'équipement rare (épées, armures, trousses).
- [difficulte.md](difficulte.md) : Facile ×0,6 sur les effectifs ennemis, bac à sable : équipement illimité, ancien équilibre.
- [interface.md](interface.md) : bouton du temps, notifications (`ui.toast`), rayon Militaire.

## Pièges et invariants
- **Portraits et gel** : le petit moteur des portraits est un contexte WebGL à part ; ses shaders se compilent d'abord sans bloquer (`compileAsync`, puis le rendu). Rendus directement, ils se compilaient au premier portrait et figeaient le jeu 0,3 à 0,9 s à l'arrivée sur l'île (la barre de l'île demande les portraits). Garder cette attente avant `renderer.render`.
- `Troop.hp` est un relevé : la vérité est l'unité au combat tant qu'elle existe. Ne jamais soigner une troupe en modifiant seulement `Troop.hp` pendant qu'elle est déployée.
- La puissance utilisée pour les vagues plafonne chaque unité présente à `MAX_UNIT_POWER` = 300 (`Hell.playerPower`), pas `War.power`.
- `troopStats` arrondit : le chevalier de l'âge 2 a exactement 230 pv. Les tests d'équilibre (`equilibreBatailles.test.ts`) en dépendent : toute retouche des bases ou de `AGE_K` change les vagues.
- Une recrue annulée ou renvoyée doit rendre pièces **et** cheval (`ride(−1)`) ; l'équipement est lu dans `Recruit.gear` / `Troop.gear` (ce que la recrue a vraiment pris), pas dans `troopKit` (la forme a pu changer d'âge entre-temps).
- `recruitWhy` dit « à partir du Moyen Âge » pour n'importe quelle troupe encore trop jeune, même une de l'âge 1 : inatteignable aujourd'hui (la caserne demande l'âge 1).
- `CommandUI.idleExpired` et `IDLE_MS` (ranger le mode ordres de l'île après 5 s) ne sont appelés nulle part : code mort. De même, dans `down` le champ `box` vaut toujours vrai, la branche « glissé = déplacer la vue » de `move` n'est jamais prise.
- Les raccourcis du commandement sont lus **avant** ceux du village (`bindKeys`) ; une touche prise doit retirer sa touche de caméra (`take`).
- En pause (`Espace`), `War.update` tourne avec `dt` = 0 : les ordres se donnent (`Hell.order` ne dépend pas du temps), rien ne bouge.
- Textes : `recruitWhy` et les phrases de `recruitPlan.ts` sont reconnues par `shortWhy` à coups d'expressions régulières (français et anglais) ; changer un message oblige à relire `shortWhy`.

## Pour modifier
- **Ajouter ou changer une troupe** : `TroopKind`, `TROOPS` (base, `forms`), `TROOP_KINDS`, `troopLook` et `TROOP_K` / `TROOP_ROLE` (`battleUnits.ts`), `ROLE` d'`isleFerry.ts`, une tenue dans `soldiers.ts`, traduction (`src/i18n/en/army.ts`), tests `evolutionTroupes.test.ts`. Vérifier `readArmy` (sauvegardes) et l'équilibre.
- **Changer une caractéristique** : `base` ou `adj` ; relancer `equilibreBatailles.test.ts` et `equilibreEnfers.test.ts`.
- **Ajouter un ordre** : type `HellOrder`, `Hell.order` et `thinkPlayer`, méthode de `Command`, touche dans `CommandUI.key`, bouton dans `onBar`, ligne d'aide dans `CONTROLS_HELP`.
- **Ajouter une bulle d'aide** : `WarTipId`, `WAR_TIP_TEXT` (≤ 100 caractères), `ORDER`, `WHEN`, l'état dans `warTipState`, l'action dans `main.ts` (`act`), test `aidesMilitaires.test.ts`.
- **Changer les places de garnison** : `troopCap`, `POP_SHARE` ; `armyCap` les combine.
- **Remplacer un portrait de troupe par un dessin** : déposer `public/troops/{clé}.webp` (168 × 224, fond transparent, le soldat en pied, de trois quarts face ; clés `soldier-1` à `soldier-5`, `archer-1` à `archer-5`, `knight-2` à `knight-5`, `cavalry-1` à `cavalry-5`), puis ajouter la clé à `TROOP_ART` (`render/troopPortraits.ts`).
