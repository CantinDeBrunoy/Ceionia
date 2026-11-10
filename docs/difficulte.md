# Difficulté

> Fichiers : `src/sim/difficulty.ts` (table `DIFFICULTY`, `rulesOf`, `readDifficulty`, textes `DIFF_TEXT`), `src/sim/economy.ts` (prix), `src/sim/sim.ts` (nourriture, croissance, disette, conditions d'âge), `src/sim/gear.ts` (prix de l'équipement), `src/sim/expeditions.ts` (risque), `src/world/world.ts` (champ `difficulty`, `unlimited`, sauvegarde), `src/main.ts` (stock de départ), `src/ui/ui.ts` (écran de choix, réglage « Ressources »).
> Tests : `tests/difficulty.test.ts`, `tests/besoins.test.ts`, `tests/fondateurs.test.ts`.
> Voir aussi : [economie-ressources.md](economie-ressources.md), [besoins-population.md](besoins-population.md), [ages.md](ages.md), [bac-a-sable.md](bac-a-sable.md), [sauvegarde.md](sauvegarde.md), [expeditions.md](expeditions.md).

## En bref
Trois difficultés, choisies au début d'une partie et sauvegardées avec elle : **Bac à sable** (`sandbox`), **Facile** (`easy`) et **Normal** (`normal`, valeur par défaut `DEFAULT_DIFFICULTY`, mise en avant « Conseillé »). Tous les réglages chiffrés sont dans la table `DIFFICULTY` ; on lit toujours les règles par `rulesOf(world.difficulty)` (Facile pour une valeur inconnue). On ne change pas de difficulté en cours de partie : « Recommencer cette carte » en relance une neuve.

## Règles du jeu

### La table (`DIFFICULTY`, `difficulty.ts`)
| Réglage | Bac à sable | Facile | Normal |
|---|---|---|---|
| `unlimited` (ressources illimitées) | `true` | `null` : suit le réglage « Ressources » du joueur | `false` : toujours comptées |
| `price` (barème de tous les bâtiments) | `null` | `null` : seuls les grands se paient | barème : bois 5 + 3/âge, pierre 3 + 3/âge, enclos 1 + 1/âge |
| `startWood` / `startStone` | 60 / 60 | 60 / 60 | 50 / 40 |
| `foodK` (nourriture par habitant) | 1 | 1 | 1,25 |
| `famine` (part des habitants qui partent par seconde de jeu, à manque total) | 0 | 0 | 0,004 |
| `growK` (vitesse de croissance) | 1 | 1 | 0,75 |
| `recoverK` / `recoverT` (croissance ralentie ×K pendant T s après un manque) | 1 / 0 | 1 / 0 | 0,5 / 100 |
| `riskK` (risque des expéditions) | 1 | 1 | 1,25 |
| `newOnly` (conditions d'âge « bâtiments neufs » seulement) | `false` | `false` | `true` |
| `gearPrice` (équipement payé aussi en bois et pierre) | `false` | `false` | `true` |

Le bac à sable et Facile ne diffèrent que par `unlimited`. Le détail des règles est dans les fichiers de chaque système.

### Où chaque réglage agit
- `unlimited` : `World.unlimited` (getter : `rulesOf(...).unlimited ?? unlimitedSetting`). Effets : `priceIn` renvoie `null`, `gearShort` / `payGear` ne prélèvent rien, `Expeditions.burning` vaut 0, conditions de minerai et de briques réputées remplies, fiches en « ∞ ». Le réglage « Ressources » (`unlimitedSetting`, sauvegardé avec les réglages) n'a d'effet qu'en Facile ; l'écran de réglages affiche le mode imposé en Bac à sable (« Illimitées ») et en Normal (« Comptées ») via `DIFF_TEXT.resForced`.
- `price` : `costOf` (`economy.ts`) ; voir [economie-ressources.md](economie-ressources.md). En Normal, le premier bûcheron et la première carrière sont offerts.
- `startWood`, `startStone` : seulement pour une partie neuve (`Game` constructeur, `main.ts`).
- `foodK` : `Sim.evaluate` : `food.demand = up((n + 1) × foodK)`.
- `famine` : `Sim.hardship` : perte de `dt × famine × (1 − cap/demande) × pop` habitants ; `fled` accumule les partants et déclenche le conseil « Disette ».
- `growK`, `recoverK`, `recoverT` : `Sim.update` (croissance) et `Sim.hardship` (`recovering`).
- `riskK` : `Expeditions.riskOf` (produit des facteurs de risque).
- `newOnly` : `reqKindsOf` et `Sim.ageProgress` (voir [ages.md](ages.md)).
- `gearPrice` : `gearCost` (`gear.ts`).
- Textes : `DIFF_TEXT` (nom, devise, points forts affichés à l'accueil, messages « Disette », « Le village se remet d'un manque », « (en plus) ») ; les chaînes brutes `RAW` sont traduites par `tr` à chaque lecture (la langue peut changer).

### Choix et reprise
- Accueil : une carte par mode ; Normal est « Conseillé » et lance directement la partie. Le menu « Recommencer » permet de changer.
- Sauvegarde : `world.difficulty` et `diffV = DIFF_VERSION` (1) dans `World.toJSON`. `readDifficulty(valeur, version)` relit les anciennes parties : sans version (avant le changement de noms), `normal` ou rien devient `easy`, `challenge` et `defi` deviennent `normal`, `sandbox` reste ; avec version 1 ou plus, valeur connue sinon `DEFAULT_DIFFICULTY`.

## Fonctionnement dans le code
- `rulesOf(d)` renvoie `DIFFICULTY[d] ?? DIFFICULTY.easy`. N'accéder jamais à la table directement avec une chaîne non vérifiée (`isDifficulty` pour valider).
- `World.difficulty` vaut `'easy'` pour un `World` fraîchement construit ; `Game` met la difficulté choisie à la création d'une partie neuve.
- Les écarts d'équilibrage se réglaient autrefois par un mode « Défi » : l'actuel Normal en est l'héritier (commits `1052836`, `3a82a14`, `d100594`).

## Liens avec les autres systèmes
- Économie ([economie-ressources.md](economie-ressources.md)), besoins ([besoins-population.md](besoins-population.md)), âges ([ages.md](ages.md)), expéditions et équipement ([expeditions.md](expeditions.md), [equipement.md](equipement.md)), sauvegarde ([sauvegarde.md](sauvegarde.md)), mode libre ([bac-a-sable.md](bac-a-sable.md)).
- Les règles de combat (armée, Enfers) ont leur propre équilibrage : `hellBalance.ts`, pas cette table (voir [armee-combat.md](armee-combat.md)). **À vérifier** : aucun usage de `rulesOf` hors `sim/`, `world/`, `main.ts` et `ui.ts` n'a été trouvé.

## Pièges et invariants
- **Compatibilité** : ne jamais renommer une valeur de `Difficulty` sans monter `DIFF_VERSION` et étendre `readDifficulty`. Les tests `difficulty.test.ts` fixent la relecture des anciens noms.
- Ajouter un champ à `DifficultyRules` oblige à le renseigner dans les trois entrées, sinon TypeScript refuse ; le renseigner à la valeur « neutre » (1, 0, `false`, `null`) pour les modes qui ne changent pas.
- La disette n'existe qu'en Normal : un test (« la disette fait partir des habitants en Normal seulement ») le garantit.
- `famine` s'exprime en secondes de **jeu** : en pause (`dt = 0`) rien ne se passe, à ×8 la disette est 8 fois plus rapide.
- L'accueil de Normal ne mentionne plus la disette (commit b28db9a) ; `DIFF_TEXT.points` n'est donc pas la liste des règles.

## Pour modifier
- **Régler l'équilibre d'un mode** : changer la valeur dans `DIFFICULTY` ; relancer `npx vitest run tests/difficulty.test.ts` (plusieurs tests fixent des valeurs, ex. 1,25 et les prix) ; mettre à jour les textes de l'accueil (`RAW.points`, `summary`) et la traduction anglaise (`src/i18n/en/menu.ts`).
- **Ajouter une difficulté** : `Difficulty`, `DIFFICULTIES`, entrée dans `DIFFICULTY`, `RAW` (`name`, `icon`, `tagline`, `points`, `summary`), traduction, carte d'accueil dans `ui.ts` (boucle sur `DIFFICULTIES`), `readDifficulty` si ancien format.
- **Faire dépendre un nouveau système de la difficulté** : ajouter un champ dans `DifficultyRules` et le lire par `rulesOf(this.world.difficulty)`, jamais par un test sur le nom du mode.
