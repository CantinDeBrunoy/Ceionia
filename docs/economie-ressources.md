# Économie et ressources

> Fichiers : `src/sim/economy.ts` (coûts, `YIELD`, raffinage, carburant), `src/sim/expeditions.ts` (`yields`, `daily`, `mineStep` : versement au fil du temps), `src/sim/freight.ts` (`railBoost`), `src/sim/difficulty.ts` (barèmes), `src/sim/gear.ts` (prix de l'équipement), `src/build/catalog.ts` (taille, âge minimal, `reqKind`), `src/build/tools.ts` (paiement à la pose et à l'amélioration), `src/build/rampart.ts` (prix des murs), `src/world/world.ts` (stocks, sauvegarde), `src/ui/ui.ts` (`#res`, `RES_META`, `renderRes`).
> Tests : `tests/difficulty.test.ts`, `tests/briques.test.ts`, `tests/rail.test.ts`.
> Voir aussi : [difficulte.md](difficulte.md), [ages.md](ages.md), [chemin-de-fer.md](chemin-de-fer.md), [equipement.md](equipement.md), [placement-construction.md](placement-construction.md), [besoins-population.md](besoins-population.md).

## En bref
Six ressources en stock dans `World` : `wood`, `stone`, `ore`, `brick`, `crude`, `fuel` (type `Resource`). Le bois et la pierre servent à **bâtir** ; le minerai à **fabriquer l'équipement** et à **passer certains âges** ; les briques à bâtir quelques grands bâtiments industriels et à passer à l'époque moderne ; le brut devient du carburant à la raffinerie ; le carburant fait rouler les automobiles. Rien ne se consomme « par habitant » : la nourriture et l'eau sont des besoins (voir [besoins-population.md](besoins-population.md)), pas des stocks.

## Règles du jeu

### Production par jour (`YIELD`, `economy.ts`)
Tableaux par âge (0 à 5) et par bâtiment, en unités **par jour de jeu** (un jour = `time.dayLen` secondes de jeu, 100 par défaut).

| Bâtiment | Ressource | Par âge 0 … 5 |
|---|---|---|
| `lumber` (bûcheron) | bois | 8, 12, 16, 22, 28, 34 |
| `quarry` (carrière) | pierre | 6, 10, 14, 18, 24, 30 |
| `mine` | minerai | 0, 0, 6, 10, 16, 20 |
| `mine` | pierre | 0, 0, 4, 6, 8, 10 |
| `gather` (place, âge 2 : marché) | bois / pierre | 3 / 2 à l'âge 2 seulement (troc) |
| `oilwell` | brut | 0, 0, 0, 3, 4, 5 |
| `brickworks` | briques | 0, 0, 0, 8, 12, 16 |

- Un bâtiment compte avec son `b.age`.
- **Gare de marchandises voisine** (`railBoost`, `freight.ts`) : la production des bâtiments de `FREIGHT_KINDS` (briqueterie, mine, carrière, bûcheron, puits de pétrole, raffinerie) est multipliée par `1 + FREIGHT_BONUS = 1,75` (`FREIGHT_BONUS = 0,75`, `RAIL_REACH = 8` cases). Voir [chemin-de-fer.md](chemin-de-fer.md).
- **Raffinerie** : traite au plus `REFINE_CRUDE = 12` barils de brut par jour (× `railBoost`) et tire `FUEL_PER_CRUDE = 0,75` carburant par baril.
- **Voitures** : chaque usine automobile (`carworks`) brûle `CAR_FUEL = 2` carburant par jour. Sans carburant (et hors ressources illimitées), les automobiles restent au garage (`Expeditions.cars()`), ce qui coupe aussi les véhicules motorisés du village et des secours.

### Stocks de départ
- Nouvelle partie (`Game` constructeur, `main.ts`) : bois et pierre = `startWood` / `startStone` de la difficulté : 60 / 60 en Bac à sable et Facile, 50 / 40 en Normal. Minerai, briques, brut, carburant : 0.
- `START_WOOD = START_STONE = 100` (`economy.ts`) ne servent que de valeur par défaut du `World` brut et de relecture d'une ancienne sauvegarde sans champ `wood` / `stone`.

### Coûts de construction (`costOf`, `priceIn`)
`age` = âge du village, borné en dessous par `minAge` du bâtiment (`a = max(age, minAge)`).
- **Facile** (`price: null`) : seuls les bâtiments d'emprise `size >= 2` se paient, sauf la place du village (`gather`, gratuite) : bois `8 + 4a`, pierre `6 + 4a` (enclos et écuries : `2 + a`). Les petits bâtiments sont gratuits.
- **Normal** (barème `price` de `difficulty.ts`) : tout se paie. `s` = emprise (`size`), 1 pour la place du village, 0,34 pour un pan de rempart (`wall`). Bois `max(1, round(s × (5 + 3a)))`, pierre `max(1, round(s × (3 + 3a)))` ; enclos et écuries : `round(s × (1 + a))` de pierre. Exemples : maison âge 0 = 5 bois et 3 pierre ; bâtiment 2 × 2 à l'âge 3 = 28 bois et 24 pierre.
- **Briques** (`BRICK_PRICE`) : `station` 10, `terminal` 30, `carworks` 20, `refinery` 30 ; en Normal ×1,5 arrondi (15, 45, 30, 45). La briqueterie elle-même n'en demande pas.
- **Offerts en Normal** : le premier `lumber` et la première `quarry` (`PRODUCERS`, `owned === 0`) sont gratuits, pour ne jamais rester sans moyen de bâtir. `priceIn` compte les exemplaires déjà bâtis.
- **Illimité** (Bac à sable, ou réglage « Ressources » en Facile) : `priceIn` renvoie `null`, tout est gratuit, l'équipement aussi, les voitures ne brûlent rien, la fiche affiche ∞. En Normal, le réglage « Ressources » est sans effet (`unlimited: false`). La production continue d'être versée au stock même en illimité.
- **Amélioration** (`Tools.upgradeSelected`) : coûte le prix du **nouveau** bâtiment à l'âge du village ; l'ancien n'est pas remboursé. **Démolir ne rembourse rien** (aucun code de remboursement dans le dépôt, sauf l'annulation d'une pièce d'équipement).
- **Remparts** (`rampart.ts` › `rampartCost`) : prix d'un `wall` × nombre de pans neufs ; la pose s'arrête quand l'argent manque.
- **Équipement** (`gear.ts` › `gearCost`) : toujours du minerai (et du carburant pour certaines pièces) ; bois et pierre seulement en Normal (`gearPrice`). Détail dans [equipement.md](equipement.md).

### Usages du minerai et des briques
- Minerai : équipement des expéditions, condition d'âge (réserve `reqOre` : 12, 30, 50) ; la base avancée des Enfers puise aussi dans une bourse (`hellBase.ts`, `Purse`).
- Briques : bâtir (voir ci-dessus) et condition d'âge (`reqBrick` : 40, 80).
- Les conditions d'âge regardent la **réserve** : en dépenser fait reculer la barre (voir [ages.md](ages.md)).

## Fonctionnement dans le code
- `Expeditions.yields()` : somme `YIELD[b.kind][r][b.age] × railBoost` sur tous les bâtiments (par jour).
- `Expeditions.daily()` : affichage de la production nette. Brut moins ce que raffinent les raffineries (`use = min(capacité, brut >= 1 ? capacité : production)`), carburant produit moins `burning()`.
- `Expeditions.mineStep(dt)` (appelée par `Expeditions.update` avec le temps de jeu) : `day = dt / dayLen`. Bois, pierre, minerai, briques : `stock += day × taux` en continu (petites parts, l'affichage arrondit). Brut : on cumule dans `prodT.crude` et on ne verse que des barils entiers. Carburant : `fuel = max(0, fuel − day × burn)`. Raffinerie : `refineT += day × capacité` ; à chaque unité et tant que `crude >= 1`, un baril part et `prodT.fuel += 0,75` ; seuls les entiers atteignent `world.fuel`.
- `canPay(w, cost)` / `pay(w, cost)` : comparent et retranchent bois, pierre, briques. `tools.ts` paie **après** la pose réussie (`place`, `upgradeSelected`) ; `rampart.ts` pan par pan.
- UI : `renderResources` (`#res`) affiche stock et taux du jour ; briques dès l'âge 3 (ou dès qu'on en a) ; brut et carburant dès l'âge 4 ou dès qu'il y en a (ou après l'expédition `oil`). `renderRes` donne la fiche d'une ressource (`RES_META`, sources par bâtiment). Le conseil `Sim.computeMessage` / `build()` s'appuie sur `Sim.producing`.
- Sauvegarde : `World.toJSON` / `fromJSON` (`wood`, `stone`, `ore`, `crude`, `fuel`, `brick`) ; un champ absent vaut 0, sauf bois et pierre qui valent `START_*` (anciennes parties).

## Liens avec les autres systèmes
- Rail : bonus de production, raffinerie et fret ([chemin-de-fer.md](chemin-de-fer.md)).
- Âges : minerai et briques en réserve, briqueterie et raffinerie exigées ([ages.md](ages.md)).
- Difficulté : barèmes, stocks de départ, `gearPrice`, `unlimited` ([difficulte.md](difficulte.md)).
- Véhicules : `Expeditions.cars()` pilote `traffic.motor` et `emergencies.motor` ([trafic.md](trafic.md), [incidents.md](incidents.md)).
- Conseil du village : explique d'où vient le bois, la pierre, les briques, le carburant ([besoins-population.md](besoins-population.md)).

## Pièges et invariants
- Les stocks sont des flottants ; l'UI affiche `floor`. `canPay` compare le flottant : « 99,9 de bois » ne paie pas 100.
- Le prix dépend de l'âge du village **et** de `minAge` : un bâtiment ne devient pas moins cher en reculant.
- Ne pas prélever avant d'avoir posé : `tools.ts` vérifie `canPay`, pose, puis `pay`. Une pose qui échoue ne doit rien coûter (cas de l'amélioration sans place).
- En Normal, les producteurs offerts se déduisent du nombre déjà posé : démolir le seul bûcheron rend le suivant gratuit.
- **Incohérence relevée** : `FREIGHT_BONUS = 0,75` (donc ×1,75) mais le commentaire de `railBoost` parle de ×1,5 et la fiche carburant (`RES_META.fuel.more`, `ui.ts`) annonce « 50 % de plus ». Le conseil du rail calcule le pourcentage depuis la constante (75 %). Le code fait foi.
- Le texte de `RES_META.ore.use` dit « sert à passer les âges et à fabriquer l'équipement » ; la mine produit aussi de la pierre (`YIELD.mine.stone`), dite seulement dans `RES_META.stone.more`.
- Le marché (`gather` âge 2) produit du bois et de la pierre : `Sim.producing` le compte comme producteur.

## Pour modifier
- **Changer un rendement** : `YIELD` dans `economy.ts` ; adapter `tests/briques.test.ts` si c'est la briqueterie ; vérifier `RES_META` (`ui.ts`) et les conseils.
- **Ajouter une ressource** : `Resource`, `World` (champ + sauvegarde), `RES_NAME`, `Expeditions.yields` / `mineStep` / `prodT`, `RES_META` et `renderResources` dans `ui.ts`, traduction.
- **Changer un prix** : barème `price` dans `difficulty.ts` (Normal) ou formule de Facile dans `costOf` ; `BRICK_PRICE` pour les briques ; mettre à jour `tests/difficulty.test.ts`.
- **Faire payer un bâtiment en briques** : l'ajouter à `BRICK_PRICE` ; `canPay`, `shortLabel` et la fiche suivent.
