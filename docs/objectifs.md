# Petits objectifs

> Fichiers : `src/sim/goals.ts` (liste `GOALS`, état `GoalState`, `stepGoals`, `activeGoals`, `progressOf`, `noteGoalEvent`), `src/main.ts` (`Game.stepGoals`, `goalCtx`, `goalsOn`, `setHideGoals`), `src/ui/ui.ts` (pastille `#goalBox` : `renderGoals`, `goalWon`, `rewardChips`, `rewardWords` ; barre du haut sur une ligne : `fitHud`), `src/sim/expeditions.ts` (`finish` compte les expéditions sans blessé et légendaires), `src/style.css` (`#goalBox`), `src/i18n/en/ui.ts` (dictionnaire `goals`)
> Tests : `tests/objectifs.test.ts`
> Voir aussi : [ages.md](ages.md), [interface.md](interface.md), [sauvegarde.md](sauvegarde.md), [tutoriel.md](tutoriel.md), [expeditions.md](expeditions.md)

## En bref
Entre deux passages d'âge, le joueur a toujours trois petits objectifs en cours, montrés un à la fois dans une pastille de la barre du haut. Chacun donne une petite récompense (bois, pierre, minerai, ou bien-être pendant quelques jours) et un mot de félicitation. Quand un objectif est atteint, le suivant de la liste de l'âge prend sa place. Idée venue des testeurs de la vague v6 (5 sur 5 : « après le tutoriel, je me suis senti lâché », « les conditions d'âge, c'est long »).

## Règles du jeu
- Chaque âge a sa liste (`GOALS`, champ `age`), de cinq à sept objectifs, dans l'ordre où ils arrivent. `activeGoals` en prend les `GOALS_SHOWN` = 3 premiers non faits.
- Un objectif qui demande un bâtiment encore fermé par une expédition (`reqMission`, ou `minAge` au-dessus de l'âge) **attend** : il ne compte pas parmi les trois, le suivant passe devant. Exemple : « Une taverne au village » attend l'expédition du brasseur.
- Au passage d'âge, les objectifs de l'âge d'avant qui ne sont pas faits ne sont plus proposés (au bac à sable, revenir à un âge d'avant ramène ceux de cet âge qui ne sont pas faits).
- Quatre façons de mesurer (`Measure`) :
  - `state` : un état du village (habitants, bâtiments, part des maisons protégées, briques en réserve, expéditions réussies). Un bâtiment amélioré compte pour son genre d'origine (`lineOf`).
  - `streak` : une condition tenue plusieurs jours de suite (nourriture et eau, tous les besoins). La série part du jour où la condition devient vraie pendant que l'objectif est en cours, et repart de zéro si elle casse.
  - `winter` : l'hiver vu pendant que l'objectif est en cours, puis le printemps (« Passer votre premier hiver »).
  - `event` : un événement compté à partir du moment où l'objectif est en cours (`base`) : expédition réussie sans blessé (`safeExp`, sans les pourparlers), expédition légendaire réussie (`legend`, `isLegendary`). Il en faut une de plus qu'à son arrivée.
- Récompenses (`reward`) : bois et pierre ajoutés directement ; minerai et bien-être passent par `applyEffects` (le bien-être est un bonus temporaire de `world.exp.temp`, comme ceux des expéditions). Le cosmodrome n'en a pas : c'est la fin.
- Atteint : un son de fête (`sfxFeast`), un message (`notice`) « Objectif atteint : … » avec la félicitation et la récompense, et la pastille dorée « Bravo ! » pendant `GOAL_WIN_MS` = 5 s.
- Pas d'objectifs pendant le tutoriel guidé (suite principale) : `Game.goalsOn` ; ils ne progressent pas non plus pendant ce temps.
- **Bac à sable** (et plus largement ressources illimitées, `world.unlimited`) : les objectifs sont là aussi, à la demande de l'auteur (« ça ne rapporte rien, mais ça peut donner un objectif au joueur »), **sans ressources** : pas de bois, de pierre ni de minerai, seulement le petit bonus de bien-être quand l'objectif en a un (pastille et message ne montrent que lui). Le mot de félicitation, le son et la pastille dorée restent, et **un feu d'artifice** part au-dessus du dernier bâtiment posé d'une des sortes de l'objectif, sinon au-dessus du cœur du village : cinq fusées en deux ou trois secondes, sans fête ni caméra (`Game.goalSpot`, `Festivities.fireworks`, chaque gerbe sonne par `onBang`). Demande de l'auteur : « ça déclenche un feu d'artifice s'ils accomplissent le défi en mode bac à sable ». Les objectifs de stock (`stock: true`, « 20 briques en réserve ») ne sont pas proposés : `activeGoals` les saute quand `GoalCtx.unlimited`.
- Option : Paramètres › Partie › « Objectifs : Affichés / Masqués » (`hideGoals`, sauvegardé avec les réglages). Masqués, ils attendent : rien ne se gagne ni ne se dit ; réaffichés, ce qui est rempli entre-temps se gagne aussitôt.

### La liste
| Âge | Objectifs (récompense) |
|---|---|
| Préhistoire | Loger 12 habitants (+25 pierre) ; Nourrir et abreuver tout le village 3 jours de suite (+30 bois) ; Réussir une première expédition (+15 pierre, bien-être +1 pendant 4 j) ; Passer votre premier hiver (+30 bois, bien-être +2 pendant 4 j) ; 3 torches (+20 bois) ; Un enclos (+20 bois) |
| Antiquité | Loger 24 habitants (+40 pierre) ; Une expédition sans blessé (+30 pierre) ; Thermes, théâtre ou arène (bien-être +2) ; 6 braseros (+30 bois) ; Tous les besoins comblés 2 jours de suite (+40 bois) |
| Médiéval | Loger 45 habitants (+60 pierre) ; Ouvrir une mine (+40 bois) ; Une taverne (bien-être +2) ; Protéger la moitié des maisons (+40 pierre) ; Un port (+40 pierre) ; Une expédition légendaire (bien-être +3 pendant 6 j) |
| Industriel | Loger 80 habitants (+80 pierre) ; Une première gare (+60 bois) ; 20 briques en réserve (+5 minerai) ; Stade, terrain de football ou fête foraine (bien-être +2) ; Protéger 80 % des maisons (+60 pierre) ; Une expédition sans blessé (+8 minerai) |
| Moderne | Loger 130 habitants (+100 pierre) ; Aéroport ou héliport (+80 bois) ; Zoo ou parc aquatique (bien-être +3) ; Protéger toutes les maisons (+80 pierre) ; Un circuit automobile (bien-être +3 pendant 4 j) ; Une centrale électrique (+80 pierre) ; Tous les besoins comblés 3 jours de suite (+10 minerai) |
| Futuriste | Loger 200 habitants (+120 pierre) ; Une arcologie (+100 bois) ; Deux fermes verticales (+80 pierre) ; Une centrale à fusion (bien-être +3) ; Le cosmodrome (rien) |

« Poser 3 décorations » était prévu à l'Antiquité ; les décorations n'existant pas encore, il est remplacé par les braseros (la torche de l'Antiquité). À changer quand elles arriveront.

### La pastille (`#goalBox`)
Picto (`hudPic` ou celui du bâtiment), texte (deux lignes au plus), jauge et compte (10/12), récompense en petites pastilles, et à droite un point par objectif en cours : un clic sur un point montre cet objectif. Un clic sur la pastille prend le bâtiment en main (le premier non verrouillé de `kinds`), ouvre les expéditions (`exp`), ou la fiche de la nourriture ou de l'eau. L'infobulle donne le texte entier, le compte et la récompense. Trop serrée (`compact`, 160 px au lieu de 214) : sans la jauge ; plus serrée encore (`mini`, 108 px) : le texte et le compte seulement.

## Fonctionnement dans le code
- `Game.frame`, toutes les 0,25 s (minuterie de l'interface) : `stepGoals()` puis `ui.update()`. `stepGoals` lit le village par `goalCtx()` (âge, habitants, jour `time.days`, saison, `sim.counts`, besoins `ok`, `coverage.share`, briques, `exp.done`), appelle `stepGoals(world.goals, ctx)` (`goals.ts`), donne la récompense de chaque objectif rendu et appelle `ui.goalWon(g)`.
- `stepGoals` ne regarde que les objectifs **en cours** (les trois premiers) : un objectif plus loin dans la liste déjà rempli sera rendu dès qu'il arrive en cours (avec sa récompense).
- Les événements : `Expeditions.finish` appelle `noteGoalEvent(world.goals, 'safeExp' | 'legend')` au retour d'une équipe.
- `UI.renderGoals` (dans `update`) redessine la pastille seulement si son HTML change (`goalKey`).

## Liens avec les autres systèmes
- Les conditions d'âge restent la seule porte vers l'âge suivant ([ages.md](ages.md)) ; certains objectifs les recoupent (loger 12 habitants), d'autres sont de simples à-côtés.
- Tutoriel : pas d'objectifs pendant la suite principale ([tutoriel.md](tutoriel.md)).
- Barre du haut sur une ligne : voir [interface.md](interface.md) (`fitHud`).

## Pièges et invariants
- **Sauvegarde** : `world.goals` (`done`, `streak`, `winter`, `events`, `base`). Absent (partie d'avant les objectifs) : `readGoalState` rend un état `quiet` ; au premier passage, les objectifs `state` déjà remplis sont notés faits **sans récompense**, de proche en proche (un fait libère la place du suivant). Identifiants inconnus filtrés, nombres non finis ignorés.
- Ne pas renommer l'`id` d'un objectif : il est dans les sauvegardes (un id inconnu est oublié, l'objectif reviendrait).
- Retirer un objectif de la liste est sans danger ; en ajouter un au milieu de la liste d'un âge le fait arriver dans les parties en cours dès qu'une place se libère.
- `#goalBox` est hors de la barre du haut pendant le commandement des troupes et dans les Enfers (`style.css`).

## Pour modifier
- **Ajouter un objectif** : une entrée dans `GOALS` (`id` unique, `age`, `text`, `praise`, `measure`, `reward`, `kinds` ou `exp` pour le clic, `pic` sinon le picto du bâtiment) ; la traduction du texte et de la félicitation dans le dictionnaire `goals` de `src/i18n/en/ui.ts` (le test `chaque texte et chaque félicitation ont leur anglais` le vérifie).
- **Un nouvel événement** : l'ajouter à `GoalEvent`, l'appeler par `noteGoalEvent` là où il arrive.
- **Changer une récompense** : `reward` (bois, pierre, minerai, bien-être `{ n, days }`).
