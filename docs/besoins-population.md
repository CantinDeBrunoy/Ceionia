# Besoins et population

> Fichiers : `src/sim/sim.ts` (classe `Sim` : besoins, croissance, conseil), `src/sim/coverage.ts` (couverture pompiers / police, bonus de bien-être), `src/sim/fields.ts` (champs : emplois, bras visibles), `src/sim/difficulty.ts` (réglages qui touchent la croissance), `src/build/catalog.ts` (valeurs `housing`, `food`, `water`, `jobs`, `joy`, `health` de chaque bâtiment), `src/ui/ui.ts` (`#needs`, `#needInfo`, `#census`, `#msg`), `src/render/coverageView.ts` (surbrillance de la couverture).
> Tests : `tests/besoins.test.ts`, `tests/couverture.test.ts`, `tests/difficulty.test.ts`, `tests/fondateurs.test.ts`, `tests/guidage.test.ts`.
> Voir aussi : [economie-ressources.md](economie-ressources.md), [ages.md](ages.md), [difficulte.md](difficulte.md), [incidents.md](incidents.md), [batiments-catalogue.md](batiments-catalogue.md), [interface.md](interface.md).

## En bref
Le village a six besoins : logement, nourriture, eau, travail, bien-être, santé. Chacun est une **capacité globale** (somme des apports de tous les bâtiments) comparée à une **demande** qui dépend du nombre d'habitants. Il n'y a **aucune portée** ni distance pour ces six besoins : un puits à l'autre bout de la carte compte autant qu'un puits voisin. Seule la Sécurité (pompiers, police) a des rayons, et elle ne bloque rien.
La population (`Sim.pop`) grandit d'un habitant à la fois tant que les six besoins sont comblés et qu'il reste une place. Elle ne baisse que par disette (Normal) ou si des logements disparaissent.

## Règles du jeu

### Les six besoins (calcul dans `Sim.evaluate`)
`n = floor(pop)`. Nourriture, eau, emplois et soins se comptent en parts entières : l'offre est arrondie en dessous (`down`), la demande au-dessus (`up`).

| Besoin | Capacité (`cap`) | Demande (`demand`) | Comblé (`ok`) |
|---|---|---|---|
| Logement `housing` | somme des `housing` | `pop` | `cap > pop` (strict : à égalité, « village plein ») |
| Nourriture `food` | bâtiments + champs + bonus d'expédition | `up((n+1) × foodK)` | `cap >= demand` |
| Eau `water` | bâtiments + maisons au bord de l'eau + bonus | `n + 1` | `cap >= demand` |
| Travail `jobs` | bâtiments + `floor(champs/2)` + bonus | `up(n × 0,5)` si `n >= 6`, sinon 0 | `cap >= demand` |
| Bien-être `joy` | bâtiments + forêts + sécurité + bonus | `pop × 0,3` si `pop >= 6`, sinon 0 | `cap >= demand` (pas d'arrondi) |
| Santé `health` | somme des `health` | `up(n × 0,2)` si `n >= 15`, sinon 0 | `cap >= demand` |

- `foodK` vient de `difficulty.ts` : 1 en Facile et Bac à sable, 1,25 en Normal. Le « +1 » de nourriture et d'eau est une part de réserve pour le village.
- Les valeurs par bâtiment sont des tableaux indexés par âge dans `KINDS` (`catalog.ts`). Un bâtiment compte avec **son** `b.age` (l'âge de son modèle), pas avec l'âge du village. Les tableaux plus courts que `AGES` sont prolongés par leur dernière valeur (boucle en bas de `catalog.ts`).
- La place du village (`gather`) donne aussi 4 logements, et à la Préhistoire 8 de nourriture et 5 d'eau (tableaux `food: [8,0,0…]`, `water: [5,0,0…]`).
- **Maisons au bord de l'eau** : une `house` avec de l'eau ou un lac dans le carré de ±3 cases autour de son coin d'origine (`World.nearWater(x, z, 3)`, test carré, pas rond) ajoute à l'eau autant que son logement (ligne « Maisons au bord de l'eau » de la fiche).
- **Champs** (`veg === VEG_FIELD`) : nourriture `(champs + champs sur cendres) × 3`, multipliée par `yieldK = 0,55 + 0,55 × moisture` (de 55 % en sécheresse à 110 %), puis par 1,3 avec le savoir-faire `seeds` (expédition « Le blé des collines »). Les champs sur cendres de lave (`w.ash`) comptent double. Un emploi pour deux champs (`floor(champs/2)`).
- **Humidité** `Sim.moisture` (0 … 1, départ 0,7) : si `rain > 0.3`, `+dt × 0,05 × rain` ; sinon baisse de `dt × [0,0015 ; 0,004 ; 0,0015 ; 0][saison]` (printemps, été, automne, hiver). `drought` : `moisture < 0.25` et au moins un champ.
- **Bien-être** : `+0,08` par case de forêt (les jardins, retirés du jeu, donnaient 0,8 par case), plus `coverage.joy` (voir plus bas). La lanterne (`lamp`) donne 0,2.
- **Bonus d'expédition** : `needBonus(world.exp, need)` (`missions.ts`) pour `food`, `water`, `jobs`, `joy` seulement : bonus durable + effets passagers (`exp.temp`, qui s'éteignent à `exp.clock`). Pas de bonus de santé ni de logement.

### Croissance (`Sim.update`)
- `canGrow` = les six `ok`. Quand c'est vrai : `grow += dt × 0,55 × growK × (recovering > 0 ? recoverK : 1)` ; à chaque unité de `grow`, `pop++` (si `pop + 1 <= cap` de logement). Soit environ 0,55 habitant par seconde de jeu en Facile, 0,41 en Normal (`growK = 0,75`).
- Le village plein (`housing.ok` faux) arrête la croissance : ce n'est pas un manque, le conseil devient « Village plein ».
- **Fondateurs** : un village sans maison à l'âge 0, avec une place du village, reçoit d'emblée `pop = 4`.
- Si `pop > housing.cap` (maisons démolies), `pop` est ramenée **d'un coup** à `cap`, sans message.

### Quand un besoin manque (`Sim.hardship`)
- **Disette** (Normal seulement, `famine = 0,004`) : si la nourriture manque, `pop` baisse de `dt × famine × manque × pop` avec `manque = 1 − cap/demand` ; les partants s'accumulent dans `fled` (remis à 0 quand la nourriture revient). Facile et Bac à sable : `famine = 0`, personne ne part.
- **Convalescence** : si l'un de nourriture, eau, travail, bien-être ou santé manque (le logement ne compte pas), `recovering = recoverT` (100 s de jeu en Normal) ; sinon il redescend de `dt`. Pendant `recovering > 0`, la croissance est multipliée par `recoverK` (0,5 en Normal). Facile : `recoverT = 0`, aucun effet.
- Un manque d'eau, de travail, de bien-être ou de santé **ne fait partir personne** : il bloque seulement la croissance.
- Aucun effet de la santé ou des services sur la population : les malaises et cambriolages sont de la mise en scène (voir [incidents.md](incidents.md)).

### La Sécurité (indicateur, jamais un blocage)
`computeCoverage` (`coverage.ts`) : part des habitations (bâtiments avec `housing > 0` à leur âge, donc les maisons, manoirs, arcologies **et la place du village**) à portée d'un poste, mesurée du centre du poste au centre de l'habitation.
- Pompiers : `FIRE_RANGE = 14` cases (poste `fire`).
- Police : `policeRange(age) = 12 + min(5, age)` cases, avec l'âge du poste (`b.age`) ; la tour de garde (`watchtower`) compte comme un poste de police.
- Jauge `share` = moyenne des deux parts. Bonus de bien-être : `COVER_JOY = 0,04` par habitation couverte **par les deux** (`both`), plafonné à `COVER_JOY_MAX = 2`.
- Un poste compte à tout âge et quelle que soit sa taille ; ce n'est pas le cas des secours animés (voir Pièges).

### Le conseil du moment (`Sim.computeMessage`)
Calculé à chaque `update`, stocké dans `message`, avec des drapeaux : `messageKind` (un clic bâtit ce bâtiment), `messageExp` (ouvre Expéditions), `messageRail` (trace une ligne depuis la gare d'id donné), `messageIsle` (commande de l'île). Premier cas vrai gagne, dans cet ordre :
1. Aucun bâtiment : poser la place du village (`gather`).
2. Aucune maison : maison, ferme, puits.
3. Nourriture manque : disette si `fled >= 1`, sinon sécheresse (si `drought`) ou « il manque de quoi manger ».
4. Eau manque.
5. Début de partie (`age === 0` et `pop < 8`) : d'abord un bûcheron, puis une carrière, tant qu'aucun bâtiment ne produit bois / pierre (`producing`).
6. Travail, bien-être, santé manquent (dans cet ordre).
7. `recovering > 0` et logement libre : message de convalescence.
8. Village plein (`room`) ou, sans voiture, carburant à zéro avec une usine automobile : d'où vient le carburant.
9. Conseil d'âge (si un âge suivant existe) : habitants manquants, puis première condition non remplie de `ageProgress` (expédition, bâtiment, minerai, briques, rail). « Tout est prêt » si rien ne manque.
10. Dernier âge : étapes de la conquête de l'espace (voir [fin-de-partie.md](fin-de-partie.md)).
11. Conseil du rail (`railTip`, dès l'âge 3), sécheresse, « Le village est paisible et prospère ».

Le helper `build(k, texte)` remplace le conseil par « Il manque du bois / de la pierre / des briques pour X : <producteur> » quand le bâtiment conseillé coûte une ressource que le village n'a pas **et** qu'aucun bâtiment n'en produit (`producing`), hors ressources illimitées.

Affichage (`ui.ts` › `renderMessage`) : ton `warn` (un besoin hors logement manque, ou sécheresse), `goal` (âge suivant en vue, ou village plein), `calm`. À partir de l'âge 1, le conseil est masqué (`quiet`) sauf manque ou passage d'âge prêt, ou si l'aide est activée (bouton cible, clé `ceionia.aides` du `localStorage`). Masqué aussi pendant le tutoriel guidé et en plein commandement.

## Fonctionnement dans le code
- `Sim.recalc()` : parcourt `world.buildings`, remplit `src` (détail par sorte pour les fiches), les totaux, compte les champs et les forêts, appelle `computeCoverage`. Déclenché par `Sim.update` quand `world.version` a changé **et** au plus tous les 0,25 s réelles (`recalcTimer`). `advance()` et le constructeur de `Game` l'appellent aussi.
- `Sim.evaluate()` : à chaque `update` (et après chaque habitant gagné ou perdu) ; applique bonus d'expédition, rendement des champs, demandes et `ok`.
- `Sim.update(dt, realDt)` : `dt` est le temps de jeu (nul en pause, ×vitesse), `realDt` sert au minuteur de recalcul. Ordre : recalcul, fondateurs, plafond de logement, horloge des expéditions, humidité, `evaluate`, `hardship`, croissance, `computeMessage`. Appelé par `Game.frame` (`main.ts`) avec `sim.rain` et `sim.season` mis à jour juste avant.
- `Sim.needDetail(k)` : alimente la fiche d'un besoin (`ui.ts` › `renderNeed`) : lignes triées par apport, bâtiment qui comble le mieux (`house, farm, well, workshop, gather, health`) et son apport `per` à l'âge du village.
- `ui.ts` › `census()` : fiche des habitants. Travailleurs `round(p × 0,5)`, employés `min(travailleurs, jobs.cap)`, malades `round(health.demand)`, affamés / assoiffés `ceil((demande − cap) / 1)`, mécontents `ceil((demande − cap) / 0,3)`. Le compteur `#pop` montre l'alerte la plus pressante : sans soins, faim, soif, sans emploi, blessés.
- Sécurité : `Sim.coverage` alimente la jauge `#n-security`, la fiche `renderSecurity` (avec `coverageTips`) et la surbrillance `CoverageView` (cercles verts à la portée de chaque poste, pastille orange sous une maison mal couverte, rouge si aucune des deux).
- `fields.ts` : n'intervient pas dans le calcul des besoins (qui compte seulement les cases de champ) ; il règle les « bras » visibles aux champs (`fieldHands`) et les engins agricoles.

## Liens avec les autres systèmes
- Conditions d'âge : `Sim.ageProgress` et `reqKindsOf` utilisent `counts` ; voir [ages.md](ages.md).
- Difficulté : `foodK`, `famine`, `growK`, `recoverK`, `recoverT` ; voir [difficulte.md](difficulte.md).
- Expéditions : bonus de besoins (`needBonus`), blessés au repos (comptés par `agents.injured()`, affichés seulement) ; voir [expeditions.md](expeditions.md).
- Habitants animés : [habitants.md](habitants.md) tire ses effectifs de `sim.pop`.
- Catalogue : toute nouvelle valeur d'apport se déclare dans `KINDS` ; voir [batiments-catalogue.md](batiments-catalogue.md).

## Pièges et invariants
- Les jauges doivent dire la même chose que `ok` : d'où les parts entières (`down` / `up`, bug « 170 / 170, il manque 0.0 », commit 7728a53). Ne pas remettre de flottants dans `food`, `water`, `jobs`, `health`.
- `pop` est fractionnaire en Normal après une disette ; l'affichage prend `floor`. `food.demand` utilise `floor(pop)`, `joy.demand` et `housing.demand` utilisent `pop` brute.
- Les âges de bâtiment évoluent **dans le rendu** (`render/buildings.ts` › `update`, un bâtiment toutes les 0,06 s après un passage d'âge) en modifiant `b.age`, sans incrémenter `world.version`. Or `recalc` ne repart que si `version` change : les capacités du nouvel âge peuvent n'apparaître qu'à la prochaine pose ou démolition. **À vérifier** (bug probable).
- `housing` sans `cap` plafonne `pop` sans prévenir le joueur quand on démolit des maisons.
- Le conseil contient un bloc mort : `if (!this.counts.house) return …` apparaît deux fois de suite (le second ne s'exécute jamais) et la branche `miss.label.startsWith('île du portail')` ne correspond plus à aucune condition (l'île du portail n'est plus exigée), donc `messageIsle` reste toujours faux. À nettoyer, pas urgent.
- Chaque texte passe par `tr('…')` avec le français exact comme clé : ne pas reformuler un message sans mettre à jour `src/i18n/en/` (voir [traduction.md](traduction.md)).
- Secours animés et couverture n'ont pas les mêmes règles de portée (voir [incidents.md](incidents.md)) : la jauge peut afficher « couvert » alors qu'aucun camion ne part.

## Pour modifier
- **Changer le coût en besoin d'un habitant** : constantes dans `Sim.evaluate` (0,5 emploi, 0,3 bien-être, 0,2 soins, seuils 6 / 6 / 15) ; mettre à jour `NEED_RULE` dans `ui.ts` et la fiche d'âge si besoin ; adapter `tests/besoins.test.ts`.
- **Ajouter un apport à un bâtiment** : tableau par âge dans `KINDS` (6 valeurs ou moins, prolongé) ; la fiche, `GIVES` / `MAIN` (`ui.ts`) et `Sim.recalc` le prennent tout seuls.
- **Ajouter un septième besoin** : champ `Need`, `NeedId`, `src`, `recalc`, `evaluate`, `canGrow`, `hardship` (`unmet`), `NEEDS` et `NEED_RULE` dans `ui.ts`, `needDetail` (bâtiment type), `computeMessage`, traduction.
- **Changer la portée des services** : `FIRE_RANGE` / `policeRange` (`coverage.ts`) ; la portée des secours animés est une constante séparée (`RANGE` dans `render/emergency.ts`, et `CREW_RANGE` dans `render/fires.ts`).
- **Nouveau conseil** : l'insérer dans `computeMessage` à sa place de priorité, mettre `messageKind` via `about(...)`, ajouter la traduction.
