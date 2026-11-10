# Fin de partie : la conquête de l'espace

> Fichiers : `src/sim/missions.ts` (les trois expéditions spatiales, `VICTORY`), `src/render/rocket.ts` (modèles des fusées), `src/render/expeditionScenes.ts` (`IdleRockets`, `launchpad`, constantes `L_*`, `padSpot`), `src/ui/spaceViews.ts` (`SpaceCast`, `showVictory`, `showVoyage`), `src/ui/voyageArt.ts` (images du voyage), `src/render/parade.ts` (la parade), `src/render/festivities.ts` (la fête), `src/main.ts` (`stepFarewell`, `festAt`, `toMenu`), `src/sim/expeditions.ts` (phase `farewell`).
> Tests : `tests/futur.test.ts` (chaîne de missions, `VICTORY`), `tests/parade.test.ts`, `tests/rendu.test.ts` (modèle du cosmodrome).
> Voir aussi : [expeditions.md](expeditions.md), [ages.md](ages.md), [batiments-catalogue.md](batiments-catalogue.md), [fin-du-royaume.md](fin-du-royaume.md) (autre fin, militaire), [habitants.md](habitants.md), [interface.md](interface.md), [traduction.md](traduction.md).

## En bref
À l'âge futuriste, trois expéditions partent du cosmodrome et s'enchaînent : le premier vol de fusée, l'homme sur la Lune, la colonisation d'une autre planète. La dernière est la **victoire** : tout le village fait la haie dans une parade, le vaisseau s'envole, un voyage plein écran montre l'arrivée des colons, puis l'écran de fin propose de continuer à bâtir ou de revenir au menu. Rien ne bloque la partie : on peut jouer après la fin. (La fin militaire, le roi des Enfers, est une autre histoire : [fin-du-royaume.md](fin-du-royaume.md).)

## Règles du jeu
- **Chaîne** (`MISSIONS`, `missions.ts`, toutes âge 5, non obligatoires) :
  1. `rocket` « Premier vol de fusée » : exige un cosmodrome (`spaceport`). Scène `launch`.
  2. `moon` « Un homme sur la Lune » : exige `rocket` réussie et un cosmodrome. Scène `moon`. Récompense `perk: 'moon'`.
  3. `colony` « Coloniser une autre planète » : exige `moon` et **cosmodrome + centrale à fusion** (`fusion`). Scène `colony`, drapeau `farewell: true`, `risk: 0` pour les deux choix, `perk: 'colony'`.
- Toutes les destinations sont `'spaceport'` (testé par `futur.test.ts`). `VICTORY = 'colony'` (`missions.ts`). `colony` et `moon` sont dans `LEGENDS`.
- **Cosmodrome** (`KINDS.spaceport`, `catalog.ts`) : 4 × 4 cases, âge 5, terrain plat, catégorie service. Centrale à fusion : 3 × 3, âge 5.
- La fusée qui attend sur le pas de tir change avec l'avancement (`IdleRockets.update`) : sonde (`probe`) tant que `rocket` n'est pas réussie, fusée lunaire (`moon`) ensuite, vaisseau colonial (`colony`) après `moon`, **rien** une fois `colony` réussie. Une fusée par cosmodrome.
- Les trois fusées (`rocket.ts`, `ROCKET_H` / `ROCKET_R`) : sonde 1,3 de haut, lunaire 1,95, colonial 2,3 (rayon de jupe 0,075 / 0,12 / 0,27).
- Équipage visible sur le pas de tir (`launchpad`) : sonde 0 astronaute, lunaire 3, colonial 6 (le groupe de l'expédition compte 3, 4, 5 membres, `party`).
- Conseil du village (`sim.ts`) : une fois `VICTORY` réussie, il dit que « le village a essaimé dans les étoiles ».

## Fonctionnement dans le code
### Déroulé de l'expédition finale (phases de `expeditions.ts`)
1. `farewell` → la phase initiale est `gather` (pas `out`) ; les colons marchent au cœur du village (`base`). Le départ pour le pas de tir (`out`) attend que le groupe soit rassemblé **et** `a.t > 20` (ou 40 s au plus).
2. `out` : marche jusqu'au cosmodrome (`dest`). `work` : compte à rebours, décollage. Durée `c.work + extra` (70 ou 56).
3. Fin du travail pour une mission `farewell` : pas de retour. `a.ok` est tiré (`chance(a)`), la phase passe à `home` avec `t = 4`, le groupe est caché ; le rapport arrive aussitôt (`onReport`).
4. `onReport` (`main.ts`) : si `r.ok && r.m.id === VICTORY && !r.redo`, `showVictory` remplace le rapport ordinaire. Une mission refaite (`redo`) n'affiche **pas** l'écran de fin, mais joue quand même parade et voyage.

### Séquence au pas de tir (`k` = avancement du travail, 0 à 1)
Constantes de `expeditionScenes.ts` : `L_BOARD` 0,16 (l'équipage marche vers la fusée), `L_IN` 0,26 (il monte), `L_FIRE` 0,30 (allumage), `L_LIFT` 0,35 (décollage), `L_GONE` 0,60 (la fusée sort du ciel ; altitude `70 × u^2,2`). La scène (`launchpad`, `rocketMesh`) pose la fusée sur `padSpot(w, pad)` : le pas de tir du cosmodrome le plus proche, repère du modèle (`SPACEPAD` dans `models.ts`) tourné avec le bâtiment, hauteur médiane des coins de l'emprise.

### Retransmission lunaire (`SpaceCast`, `spaceViews.ts`)
- Seulement pendant `moon` en phase `work`, pour `k` entre `CAST_FROM` = `L_GONE + 0,02` et `CAST_TO` = 0,985. Un petit panneau (`.spacecast`) montre un canevas 2D (360 × 216, ×2) : descente du module (jusqu'à 40 % de la séquence), poussière, astronaute qui descend l'échelle (dès 55 %), bondit, plante le drapeau (80 %) et salue ; légendes `tr()` selon l'avancement. Appelé chaque image par `main.ts` (`spaceCast.update(expeditions.active)`).
- Le choix « cratères » est reconnu par la regex `/cratères|craters/i` sur le **libellé** du choix (`a.c.label`) : renommer le choix casse le décor lunaire.

### Parade (`Parade`, `parade.ts`, pilotée par `Game.stepFarewell`)
1. Au premier appel pour une mission `farewell` : `agents.recruit(min(60, disponibles))` donne la foule ; `agents.findPath(base, dest)` fournit la route (cases de route de préférence, sinon tracé direct) ; `parade.start(route, base, dest, âge, n)` renvoie les places des habitants et dresse le reste (figurants, mâts, guirlandes, char).
2. Places candidates des deux côtés de la route sur deux rangs (décalages 0,42 et 0,72 case), tous les 0,34 case ; exclues : à moins de 2,4 cases du cœur (la fête) ou de 4 cases du pas de tir (la fusée), bâtiments, eau, forêt, décor (`free`) ou croisement de route (`crossed`). Figurants : `min(44, max(8, n))` en plus de la foule ; 1 sur 9 tambour, 1 sur 9 trompette (rang 8), les autres porteurs de fanions.
3. Les habitants gagnent leur place 6 par image (`f.sent`) ; sans place, ils font un cercle près du cœur. Une fois arrivés ils acclament (`partyAct 'cheer'`).
4. Le char précède les colons : il suit le chef du groupe + 2,6 cases (`project`), plafonné à `len − 5,4`. Confettis (`CONF_CAP` = 1600) et serpentins (`SERP_CAP` = 36), un pétard sonore par `onPop` (`audio.sfxBang(0.12)`).
5. **Lâcher de la fusée** : quand `k >= L_LIFT + 0,07`, ou `k >= L_LIFT` sans que la caméra suive l'expédition, `f.rel` est noté, la caméra (si elle suivait, en surface) va au milieu de la parade (`parade.middle()`, distance entre 18 et 40) et **deux** fêtes sont déclenchées (`festAt` ×2 : la seconde « s'empile », voir plus bas).
6. **Voyage** : quand `a.t − f.rel >= PARADE_G` (10 s de jeu) **et** 6 s réelles (`PARADE_MS`), ou `k >= 0,92`, ou `a.t >= (work + extra) × L_GONE` : `showVoyage` ; le temps du jeu est mis en pause (`time.paused`) et restauré à la fin.
7. Fin : `parade.stop()` dès qu'il n'y a plus d'expédition `farewell` active (démonte tout, libère la foule : `agents.dismiss`).

### Voyage (`showVoyage`, `voyageArt.ts`)
- Plein écran, canevas 960 × 540 (dessin à 480 × 270, ×2), durée fixe `VOYAGE_S` = 24 s **réelles** quelle que soit la vitesse du jeu ; bouton « Passer » ; une minuterie de secours (`VOYAGE_S` + 1,5 s) le termine si l'onglet est en arrière-plan. Au retour (`onDone`) : `expeditions.landNow(a)` fixe `a.t` à la fin du travail, et le rapport / l'écran de fin suit.
- `drawVoyage(ctx, u, t, jump)` renvoie la légende. Avant `u = 0,62` : `spaceScene` (départ jusqu'à 0,16, traversée jusqu'à 0,42, approche, entrée dans l'atmosphère) ; après : `surfaceScene` (descente jusqu'à 0,755, rampe à 0,78, feu de camp dès 0,87, fondu au noir dès 0,95).
- `jump` (saut à travers l'espace, tunnel de lumière) est décidé par la regex `/saut|jump/i` sur le libellé du choix : même fragilité que pour les cratères.

### Écran de fin (`showVictory`)
Fenêtre modale `.victoryCard` : planète bleue animée (`drawPlanet`), titre, texte, statistiques (`VictoryStats` : habitants, bâtiments, expéditions réussies, jours). Deux boutons : « Continuer à bâtir » (ferme la fenêtre, `onClose`) et « Revenir au menu » (`Game.toMenu` : `saveNow()`, `running = false`, `location.reload()`).

### Fête du retour (`Festivities`, `festivities.ts`)
Elle ne tient pas qu'à la fin de partie : `main.ts` déclenche `festAt` pour toute expédition qui rentre avec succès (`phase === 'home' && ok`, une seule fois par `a.id` via `feted`), et la chute du roi des Enfers l'appelle aussi (`kingStage`). Voir [expeditions.md](expeditions.md) pour le retour. Résumé :
- Lieu : la grande place la plus proche (`plazaNear`, bâtiment `gather` de taille ≥ 3 ; `fire: true` à la Préhistoire, le feu du clan flambe), sinon une case dégagée près du cœur (`spot`).
- Durée `dur` : 28 s avant l'âge 3, 34 s ensuite. Une autre fête à moins de 4 cases **prolonge** la même (`dur ≥ t + 28`, `boost` jusqu'à 3, plus de salves).
- Décor et effets par âge : guirlandes de feuillage, fleurs et pétales, fusées d'or, confettis, grand feu d'artifice multicolore (`BURSTS`, `FLAGS`, `MAST`). `onBang` / `onFeast` jouent les sons. Une danse (ronde de `dancers`), un orchestre (`band`), un festin.
- `fest.update(dt)` est appelé avec le temps **réel** (`dt`), non le temps de jeu : la vitesse du jeu ne l'accélère pas et la pause ne l'arrête pas.

## Liens avec les autres systèmes
- [expeditions.md](expeditions.md) : phases, `landNow`, `chance`, rapport, suivi par la caméra (`following`).
- [ages.md](ages.md) : l'âge 5 donne le cosmodrome ; [batiments-catalogue.md](batiments-catalogue.md) pour `spaceport` et `fusion`.
- [habitants.md](habitants.md) : `recruit`, `memberGo`, `partyAct`, `dismiss`, `findPath` pour la foule.
- [sauvegarde.md](sauvegarde.md) : `exp.done` et `exp.perks` portent `moon` et `colony` ; `toMenu` sauvegarde avant de recharger.
- [traduction.md](traduction.md) : légendes lunaires et du voyage passent par `tr` / `trx` ; les regex sur les libellés doivent accepter les deux langues.
- La fête foraine (`fairground.ts`, montagnes russes, tour de chute) et le cirque (`circus.ts`) sont des **bâtiments de loisirs** sans lien avec la fin ni avec la fête : voir [rendu-modeles.md](rendu-modeles.md) et [batiments-catalogue.md](batiments-catalogue.md). Le trophée du roi des Enfers est décrit dans [faune.md](faune.md).

## Pièges et invariants
- Les regex `/cratères|craters/i` et `/saut|jump/i` lisent le libellé du choix : un changement de texte (ou de traduction) change silencieusement le décor.
- La parade n'existe que si une expédition `farewell` est active ; `stop()` doit toujours être appelé quand elle disparaît, sinon foule et haies restent. `stepFarewell` libère aussi la foule quand le jeu quitte la mission.
- La foule est recrutée dans les habitants disponibles (60 au plus) ; avec peu d'habitants la haie est clairsemée, c'est normal.
- Le temps du jeu est en pause pendant le voyage (`time.paused = true`), mais la parade continue de vivre (elle lit `dt` réel). Ne pas réutiliser `was` ailleurs : le jeu doit retrouver l'état de pause qu'il avait.
- `a.ok` d'une mission `farewell` vient de `chance(a)` ; avec `risk: 0` l'échec semble impossible, mais les textes `loseText` existent : à vérifier si un modificateur peut encore faire échouer (`riskK`).
- La seconde `festAt` au lâcher de la fusée sert à gonfler la fête (`boost`) ; en retirer une change l'intensité de la fête de la parade.
- Un test ne couvre pas la séquence complète (parade + voyage + écran) : un essai en jeu est nécessaire après modification (`window.__game` pour préparer, sans juger l'équilibre).
- Partie sauvegardée pendant la mission finale : le comportement à la reprise (phase `gather`, parade recréée par `stepFarewell` si `this.farewell` est vide) est à vérifier.

## Pour modifier
- **Changer ce qui exige la fin** : `requires` de la mission dans `missions.ts`, puis le texte du conseil (`sim.ts`) et `futur.test.ts`.
- **Ajouter un jalon spatial** : une mission âge 5 (destination `spaceport`), une fusée dans `RocketKind` / `drawRocket` / `ROCKET_H` / `ROCKET_R` (`rocket.ts`), l'enchaînement dans `IdleRockets.update`, le type de scène dans `launchpad`. Mettre à jour `futur.test.ts` (l'ordre des trois missions est testé).
- **Changer la parade** : constantes en tête de `parade.ts` ; durée avant le voyage `PARADE_G`, `PARADE_MS` (`main.ts`).
- **Changer le voyage** : `VOYAGE_S` et les seuils de `u` dans `voyageArt.ts` ; garder les légendes en `trx`.
- **Changer l'écran de fin** : `showVictory` ; les textes ont leur traduction dans `src/i18n/en/`.
