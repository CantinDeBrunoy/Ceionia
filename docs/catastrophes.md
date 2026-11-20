# Catastrophes naturelles

> Fichiers : `src/sim/calamity.ts` (logique pure : programme, où déborde une crue, constantes), `src/calamities.ts` (classe `Calamities` : programme en jeu, annonces, étapes, dégâts, comptes rendus, cartes d'incident, réparations), `src/render/flood.ts` (`FloodView` : la nappe de la crue), `src/render/repairs.ts` (`RepairsView` : échafaudages et poussière des bâtiments abîmés), `src/world/world.ts` (`damaged`, `flooded`, `calam`, `starIron`, sauvegarde), `src/sim/sim.ts` (bâtiments abîmés et champs noyés dans les capacités), `src/sim/difficulty.ts` (champ `calamity`), `src/main.ts` (câblage, réglages, `__game.calamity`), `src/ui/ui.ts` (interrupteurs des réglages).
> Tests : `tests/catastrophes.test.ts`.
> Voir aussi : [incidents.md](incidents.md) (incendies, cartes d'incident, volcan qui se réveille), [ciel-meteo.md](ciel-meteo.md) (la pluie), [eau-rivieres.md](eau-rivieres.md), [difficulte.md](difficulte.md), [sauvegarde.md](sauvegarde.md).

## En bref
Des catastrophes naturelles rares : la **crue** (une rivière, un étang ou un lac déborde après une forte averse). Une **au plus par âge** (choix de l'auteur), annoncée juste avant par un message cliquable ; la vue n'est jamais arrachée au joueur (leçon de la vague de tests : la caméra qui partait vers le volcan pendant qu'on bâtissait). Chacune a son interrupteur dans les réglages ; le réglage général « Catastrophes » les coupe toutes, avec les éruptions spontanées et les incendies.

## Règles du jeu

### Le programme (une au plus par âge)
- À chaque âge, `planAge` tire le sort : la catastrophe peut venir après `CALAM_DAYS` = 4 à 10 jours de jeu passés dans l'âge, ou pas du tout (Facile : une chance sur deux, `calamity.chance`). L'âge et le délai restant sont dans `World.calam` (sauvegardé).
- Le jour venu, une catastrophe est tirée parmi celles que le joueur laisse venir **et** qui peuvent avoir lieu sur la carte (une eau qui déborde pour la crue). Aucune possible : on attend. Elle attend ensuite son heure (`pending`) : la crue, une forte averse. Au-delà de `WAIT_DAYS` = 3 jours d'attente (le joueur impose le beau temps), une autre est tirée.
- Le délai ne court pas quand les catastrophes sont coupées ni pendant une catastrophe.
- Une fois lancée, `calam.due = -1` : plus rien jusqu'à l'âge suivant.

### Les dégâts selon la difficulté (`DIFFICULTY[...].calamity.harm`)
| | Bac à sable (`none`) | Facile (`light`) | Normal (`full`) |
|---|---|---|---|
| Chance qu'un âge en ait une | 1 | 0,5 | 1 |
| Champs sous l'eau sans récolte | non | oui | oui |
| Champs à resemer après la crue | non | non | un sur trois (`FLOOD_RUIN`) |
| Bâtiments abîmés | non | non | oui |

### Bâtiment abîmé
- `World.damaged` : id → secondes de jeu de réparations restantes et en tout (`REPAIR_DAYS` = 1 journée). Pendant ce temps, le bâtiment ne donne que `DAMAGED_K` = la moitié de tout ce qu'il donne (logements, nourriture, eau, emplois, bien-être, santé : `Sim.recalc`).
- Les réparations se font seules. Message « 🔨 Réparations terminées : … ». Démoli ou amélioré (nouvel id), il n'est plus abîmé.
- Décor : un échafaudage (trois perches, deux planches, une perche en biais) contre un mur, des gravats au pied, un peu de poussière (`RepairsView`). Une seule carte d'incident « Réparations » (le nombre de chantiers), dont l'œil mène au moins avancé.

### La crue
- **Où** (`floodSite`) : une eau qui peut déborder (`riverish`) : un lac de montagne, ou une eau au niveau de la mer dans un chenal (moins de 36 % et plus de 10 % d'eau dans un carré de 13 cases : la côte d'une mer en a la moitié, une mare presque rien). Moins de 120 cases d'eau d'un seul tenant : un « étang ». On préfère une eau qui borde des champs ou des bâtiments (12 essais) ; à défaut, n'importe quelle eau qui déborde à 40 cases au plus du milieu du village (le spectacle).
- **Ce qui est noyé** (`growFlood`) : le tronçon d'eau à `FLOOD_SPAN` = 9 cases au plus du point tiré, puis, de proche en proche, les cases de terre à moins de `FLOOD_RISE` = 0,6 au-dessus du niveau de l'eau (0 la rivière, le niveau du lac), à `FLOOD_REACH` = 4 cases au plus de l'eau. Au moins `FLOOD_MIN` = 5 cases.
- **Ce qui l'arrête** : un rempart (une digue : pan ou porte, `isRampart`), une berge relevée à l'outil de terrain (au-dessus de 0,6), l'entrée d'une grotte, un volcan, une faille.
- **Déroulé** (secondes de jeu, `calamities.ts`) : le jeu fait venir la pluie (sauf l'hiver, ou si le joueur impose le temps) ; 15 s d'averse forte (`rainK > 0,75`) ; annonce « 🌊 Les eaux montent : la rivière va déborder ! » (cliquable, carte d'incident) ; 20 s plus tard l'eau monte en 15 s, reste 60 s, se retire en 30 s. La pluie dure tant que l'eau n'a pas commencé à baisser.
- **Dégâts** : à la montée, les champs noyés ne donnent plus rien (`World.flooded`, non sauvegardé) ; à l'eau haute, les bâtiments touchés sont abîmés (3 au plus, `FLOOD_HURT`, les plus près de l'eau), sauf ceux qui ont les pieds dans l'eau (`WATERPROOF` : ponton, port, et `SEASIDE`) ; au retrait, un champ noyé sur trois redevient de l'herbe. Les routes sous l'eau ne sont coupées qu'à l'œil (les trajets ne changent pas).
- **Compte rendu** : « 🌊 La crue s'est retirée : n champs noyés, n à resemer, n bâtiments abîmés. » et, s'il y a des dégâts, le conseil de la digue ; sinon « sans dégâts ».
- **Son** : un grand plouf à la montée (`sfxSplash`) ; la pluie et l'orage font le reste.

### Réglages
- Réglages › Partie › Règles : sous « Catastrophes », la rangée « Catastrophes naturelles » : Crues, Séismes, Météorites, chacun allumé ou éteint (`Calamities.enabled`). Retenus dans les réglages : `noFlood`, `noQuake`, `noMeteor` (absents : allumés).
- Le réglage général « Catastrophes » (`world.disasters`) coupe tout ; coupé pendant une crue, l'eau se retire tout de suite (avant la montée, la crue s'annule).

## Fonctionnement dans le code
- `Game` crée `Calamities` (hôte : monde, temps, météo, sons, âge, messages, `goTo` qui ramène à la surface puis déplace la vue) ; `frame` appelle `calam.update(gdt, dt)` après `wakeVolcano` ; `incidents()` ajoute `calam.incidents()` (clés `calam:flood`, `calam:repair`).
- `Calamities.update` : réparations (temps de jeu), programme, étape de la crue, décor des réparations (temps réel).
- `FloodView` : un maillage de quads (2 × 2 par case) sur les cases noyées et l'eau du tronçon ; chaque sommet garde la hauteur du sol ; au bord (un sommet qui touche une case hors de la nappe), il plonge sous le sol ou sous la rivière, sinon il suit le niveau `level + 0,6 × k` plus une petite houle. Couleur boueuse par sommet, écume claire au bord et bouffées d'écume au front. Le maillage existe dès le départ (rien à dessiner) : son programme se compile au chargement.
- Une capacité qui change sans toucher au plan (abîmé, réparé, champs noyés) incrémente `World.ageVersion` : `Sim` se recalcule.

## Pièges et invariants
- **Jamais de saut de caméra** : un message cliquable et la carte d'incident (l'œil). Ne pas appeler `cam.goTo` sans un geste du joueur.
- La pluie de la crue passe par `env.wantKind`, comme les réglages de la météo ; un temps imposé par le joueur (`manualWeather`) n'est jamais changé.
- Les cases de la crue sont dans l'ordre où l'eau les gagne : `buildings` garde ainsi les plus proches de l'eau.
- `damaged` est sauvegardé par rang dans la liste des bâtiments (les ids changent au chargement), comme les arrêts des lignes de train.
- Essayer : `__game.calamity('flood')` lance tout de suite l'annonce (false si aucune eau ne peut déborder). Pour un village au bord d'une vraie rivière, la carte `?n=192&seed=2026` en a une au nord-est.

## Pour modifier
- **Plus ou moins souvent** : `CALAM_DAYS` et la chance par difficulté (`calamity.chance`, `difficulty.ts`).
- **Plus ou moins de dégâts** : `DAMAGED_K`, `REPAIR_DAYS`, `FLOOD_RUIN`, `FLOOD_HURT`, `calamity.harm`.
- **La crue** : hauteur et portée (`FLOOD_RISE`, `FLOOD_REACH`, `FLOOD_SPAN`), durées des étapes en tête de `calamities.ts`, couleurs dans `flood.ts`.
- **Une nouvelle catastrophe** : son nom dans `CalamityKind` et `CALAMITIES`, sa condition dans `Calamities.can`, son heure dans `time`, son lancement dans `start`, son étape dans `update`, sa carte dans `incidents`, son interrupteur (`CALAM_FX`, `ui.ts`) et son réglage (`no…`, `Settings`, `Game.settings`).
