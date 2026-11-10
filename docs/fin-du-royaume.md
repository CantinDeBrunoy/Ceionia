# Fin du royaume des Enfers

> Fichiers : `src/sim/kingdom.ts` (`KingFight` : combat du roi ; `claimKingdom` : récompenses), `src/sim/war.ts` (`conquerKingdom`, `portalOut`, `bringHome`), `src/kingdomStage.ts` (`KingdomStage` : bannière, barre, tambours, cris, cinématique), `src/kingdomEnd.ts` (la partition : plans, bandeaux, fondus), `src/ui/kingdom.ts` (`BossBar`, `showKingdomVictory`, textes), `src/render/goldenBurst.ts`, `src/render/kingdomEndFx.ts` (effets de surface), `src/render/hellView.ts` (`startCollapse`, boules de feu, plaques de feu), `src/render/trophies.ts` (couronne), `src/main.ts` (`kingStage`, `kingCrowd`, `festAt`, `playKingdomEnd`, `syncBlight`).
> Tests : `tests/royaume.test.ts`, `tests/cinematiqueFin.test.ts`, `tests/trophees.test.ts`, `tests/contamination.test.ts`.
> Voir aussi : [enfers.md](enfers.md), [portail-ile.md](portail-ile.md), [armee-combat.md](armee-combat.md), [expeditions.md](expeditions.md), [faune.md](faune.md) (trophées), [sauvegarde.md](sauvegarde.md).

## En bref
Au fond des Enfers, la zone 6 abrite le roi démon et sa citadelle. Le roi dort tant qu'on ne l'approche pas ; réveillé, il invoque, lance des boules de feu et, à mi-vie, enrage. Une fois le roi tué, la citadelle s'affaiblit ; la détruire fait tomber le royaume : le portail s'éteint, le village touche des récompenses durables, une cinématique d'environ 27 s raconte la fin. Rien de tout cela n'est requis pour passer d'âge.

## Règles du jeu
### Le royaume
- Accès : zone 6, âge Futuriste (`ZONE_AGE[6]` = 5) et zones 1 à 5 conquises ([enfers.md](enfers.md)). Une bannière s'affiche à l'arrivée de la caméra dans la zone (`KingdomStage.update`, une fois par session) ; la bulle d'aide `kingdom` rappelle les cercles rouges.
- Garnison (`garrisonOf('kingdom')`) : le roi, 6 gardes d'élite, 2 chefs, 3 brutes, 5 archers, 4 diablotins, 3 golems, 2 démons cornus, 2 seigneurs, 1 titan (moins nombreux en Facile, sauf le roi, les seigneurs et le titan : `garrisonSized`). Citadelle : 4000 pv × 1,5 (zone 6) = 6000, armure 8, tire 16 × 1,5 à 8 cases toutes les 1,4 s. 4 tours (`spire`) autour des douves de lave, deux ponts.
- Le roi (`demonStats('king')` : vie × 2,8 = 4480, dégâts × 1,35 = 54, portée 1,2, cadence 2,2 s, vitesse 1,1). L'armure de la citadelle (8) retranche de chaque coup : un soldat faible l'égratigne à peine.

### Le combat du roi (`KingFight`, `kingdom.ts`)
- **Phase 0** : il dort. Il se réveille si une unité du joueur passe à moins de `KING_WAKE` = 11 cases, ou si lui ou la citadelle est touché.
- **Phase 1** (réveillé) : toutes les `SUMMON_EVERY` = 13 s, `SUMMON_N` = 3 diablotins invoqués autour de lui (au plus `SUMMON_CAP` = 8 vivants) ; boule de feu toutes les 5 s (`FIREBALL_EVERY[0]`) sur un soldat à moins de `KING_REACH` = 13 cases : un cercle rouge prévient `FIREBALL_FALL` = 1,5 s, puis dégâts `FIREBALL_DMG` = 26 dans `FIREBALL_R` = 1,5 case (événement `blast`).
- **Phase 2** (rage) : à `ENRAGE_AT` = 50 % de sa vie. Dégâts ×1,35, vitesse ×1,3, cadence ×0,8 (`RAGE`) ; invocations ×1,4 plus espacées ; boule de feu toutes les 3,2 s ; une plaque de sol qui s'embrase toutes les `PATCH_EVERY` = 2,4 s près d'un soldat (rougeoie `PATCH_WARM` = 1,4 s, puis brûle `PATCH_BURN` = 6 s, rayon `PATCH_R` = 1,3, `PATCH_DPS` = 10 par seconde, par ticks d'une demi-seconde) ; un cri toutes les `ROAR_EVERY` = 9 s (la vue tremble).
- **Phase 3** (roi abattu) : boules de feu et plaques disparaissent ; `shake()` met l'armure de la citadelle à `CITADEL_ARMOR_FALLEN` = 3 et ses tirs à `CITADEL_POWER_FALLEN` = 0,5 de leur force. La barre de vie passe du roi à la citadelle (« Le roi est tombé : abattez sa citadelle »).
- **Chute** : citadelle à 0 pv → `Hell.destroy` pose `victory` et l'événement `victory` → `War.conquerKingdom`.

### La victoire et ce qu'elle change ensuite
`War.conquerKingdom` (une fois) : `king.collapse()` (garnison de la zone 6 morte, bâtiments démoniaques de la zone rasés), `raidsRepelled ≥ SECURE_WAVES`, récompenses (`claimKingdom`), nouvelle `victory` (toast ou cinématique).
- **Récompenses** (une seule fois par partie : le perk `hellking` l'empêche de recommencer) : trophée « couronne du roi » sur la place du village (`KINGDOM_PERK`, `trophies.ts`), **forge infernale** (`FORGE_PERK` : équipement fabriqué `FORGE_CRAFT` = 1,5 fois plus vite, risque des expéditions × `FORGE_RISK` = 0,85), `KINGDOM_ORE` = 250 minerai, équipement rare (4 épées, 4 armures, 3 trousses : `KINGDOM_GEAR`), +3 bien-être durable (`KINGDOM_JOY`, `exp.bonus.joy`), île comptée pour sécurisée (`isleGuard.waves` ≥ 5).
- **Le portail s'éteint** (`War.portalOut` = `faction.victory`) : plus aucune vague (`raidDue`, `nextWaveIn` nul, le cor refusé), `inv` forcé à `done`, plus de passage vers les Enfers (`sendThroughPortal`, `recruitHell` refusent ; `hellPresence()` faux ; les casernes avancées ne comptent plus dans `barracks()`), les troupes des Enfers rentrent sur l'île dès que la vue est revenue en surface (`bringHome`), le tourbillon s'éteint (`portalLit` faux), la contamination tombe à 0,03 (`blightLevel`, `hellFallen`), les aides `base`, `kingdom`, `ageLock` se taisent (`victory`).
- Les Enfers restent des données : la faction garde `victory` dans sa sauvegarde, la vue montre un royaume englouti d'emblée (`HellView.stepCollapse`).

## Fonctionnement dans le code
- **Pas** : `War.stepHell` → `faction.step`, `base.step`, `king.step` (après le pas de la faction). `KingFight.step` marque `arrived` (une unité du joueur en zone 6) mais le combat n'en dépend pas : il est sauvegardé et plus jamais lu.
- **Sauvegarde** : `KingSave` = `{ phase, arrived, fallen }` dans `WarSave.king`. `KingFight.load` : sans sauvegarde mais victoire de la faction → phase 3 et `fallen` ; roi absent alors que la phase dit « combat » → phase 3 ; phase 2 → réapplique la rage (`boost`) ; phase 3 → `shake()`. Boules de feu, plaques, minuteurs ne sont pas sauvegardés. Les récompenses non encore vues sont dans `WarSave.reward` ; `endSeen` empêche de rejouer la cinématique.
- **Mise en scène** (`KingdomStage`, un par `Game`) : `news(n)` prend les nouvelles `boss` (toast `danger` et caméra sur le combat via `focusFight`, sauf à la mort du roi) et `victory` (`startFinale`). `update(dt)` (chaque image, appelée par `stepWar`) : bannière, tremblement lors des cris (`roars`), tambours (0,6 s en phase 1, 0,42 s en phase 2, un accent tous les 4 temps), barre de vie `BossBar` (le roi en phases 1 et 2, la citadelle en phase 3), avancée de la cinématique, puis écran de victoire si `war.reward` est en attente et qu'on est en surface (partie quittée pendant la cinématique).
- **Cinématique** (`kingdomEnd.ts` ; `END_PLAN`, total `END_TOTAL` ≈ 27 s), cinq plans :
  - `collapse` 8 s : depuis les Enfers, la caméra s'éloigne de la citadelle jusqu'à 34 cases en tournant, ruines englouties et lave qui monte (`HellView.startCollapse`), grondement, tremblement.
  - `travel` 2 s : voile de lumière, `exitHell` au premier instant, caméra sur le portail de la surface.
  - `portal` 5,5 s : démons restants dissous à 0,2 s, soldats aux armes levées à 0,8 s, explosion dorée `GoldenBurst` à `BURST_AT` = 1,1 s qui passe `portalOut` à vrai.
  - `isle` 6 s : à 0,5 s la contamination se lève (`regreen`), anneaux dorés, la vue monte.
  - `village` 5,5 s : la vue glisse vers le cœur du village, jusqu'à 28 habitants fêtent bras levés (`kingCrowd`), feu d'artifice toutes les 1,6 s (`festAt`).

  Bandeaux (`END_CAPTIONS`) : « Le roi des Enfers est tombé », « Le portail s'éteint », « L'île est sauvée ». Fondu au noir sur les `END_FADE` = 1,6 dernières secondes. Lancée de la surface (partie quittée aux Enfers, portail déjà éteint), elle saute les deux premiers plans (`endShotStart('portal')`).
- **Fin** : `endFinale` retire effets et habillage (`body.cinematic`), renvoie en surface si besoin, joue `sfxAgeUp`, puis `showKingdomVictory` (couronne dans la lumière, récit, liste des récompenses ; « Continuer » ou « Retour au village » = `goHome`). Passer : Échap, Espace ou le bouton (écoutés en phase de capture, la partie ne réagit pas).
- **Une seule fois** : `playEnd` pose `war.endSeen = true` dès le lancement (`shouldPlayKingdomEnd`) ; une partie rechargée en cours de route ne la rejoue pas. La rediffusion du mode développeur `__game.playKingdomEnd()` (`force`) ne touche ni aux récompenses ni à la contamination (`holdingBlight` faux).

## Liens avec les autres systèmes
- [enfers.md](enfers.md) : zone 6, forteresses d'avant, base avancée ; `Hell.victory`.
- [portail-ile.md](portail-ile.md) : l'île sécurisée et purifiée, vagues suspendues.
- [armee-combat.md](armee-combat.md) : les mêmes règles de combat (armure, portée, `big`) ; les troupes de la base se battent ici.
- [expeditions.md](expeditions.md) : `FORGE_PERK` agit sur l'atelier (`craftT`) et le risque des missions (`expeditions.ts`) ; `exp.perks`.
- [faune.md](faune.md) : les trophées (`trophiesWon`).
- [sauvegarde.md](sauvegarde.md) : `world.exp.perks`, `exp.gear`, `exp.bonus`, `isleGuard` (monde) et `WarSave` (guerre).
- [tutoriel.md](tutoriel.md) : les bulles d'aide `kingdom`.

## Pièges et invariants
- `claimKingdom` se protège par le perk `hellking` : ne jamais l'appeler hors de `conquerKingdom` ; la récompense visible (`War.reward`) est remise à `null` par l'écran de victoire, sinon il se rouvre à chaque retour en surface.
- Les `conquered` de la zone 6 et `victory` viennent de la **destruction de la citadelle**, pas de la mort du roi (phase 3 seulement).
- Un roi tué hors de portée de la caméra déclenche quand même la phase 3 (`step` voit `!k`) ; la nouvelle `boss` n'est pas suivie de `focusFight` si on est en surface.
- Les boules de feu et plaques frappent `h.alive('player')` : les unités de la garnison au combat comme les essais du mode développeur.
- `portalOut` devient vrai deux fois : à la victoire (sim) et à l'explosion dorée (vue, `KingdomStage.portalOut`) ; le tourbillon brûle donc jusqu'à l'explosion, et d'emblée éteint dans une partie reprise.
- La cinématique s'appuie sur `h.cam.jump`/`goTo` : la caméra du joueur est confisquée jusqu'à `endFinale`.
- `arrived` est mort (écrit, jamais lu) ; la bannière dépend de la position de la caméra (`bannerShown` n'est pas sauvegardé : elle revient à chaque session).
- Après la chute, la vue des Enfers reste accessible par le portail (voir [enfers.md](enfers.md), « à vérifier »).

## Pour modifier
- **Changer le combat du roi** : constantes de `kingdom.ts` ; `royaume.test.ts` les importe presque toutes ; les cercles et plaques sont dessinés par `HellView` (lit `KingFight.fireballs` et `patches`).
- **Changer les récompenses** : `KINGDOM_ORE`, `KINGDOM_GEAR`, `KINGDOM_JOY`, `FORGE_*` ; ajouter une ligne dans `showKingdomVictory` et sa traduction (`KINGDOM_TEXT`, `src/i18n/en`).
- **Changer la cinématique** : `END_PLAN` (durées), `END_CAPTIONS`, puis les actions de `stepFinale` ; garder `END_CAPTIONS.at + dur` dans la durée du plan (testé).
- **Ajouter une phase au roi** : `KingPhase`, `step`, `KingSave` (champ avec valeur par défaut), barre de vie de `KingdomStage.update`, test.
