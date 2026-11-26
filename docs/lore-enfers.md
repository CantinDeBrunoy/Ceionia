# Le bâton du fondateur : pourquoi descendre aux Enfers

> Fichiers : `src/sim/staff.ts` (règles pures : état du bâton, relecture des anciennes parties, quand le vol se joue, bonus), `src/render/founderStaff.ts` (le bâton et ses monuments par âge, `STAFF_SLOTS`, `FounderStaff`), `src/staffCine.ts` (la partition du vol), `src/staffStage.ts` (`StaffStage` : le vol joué en direct), `src/world/world.ts` (`World.staff`, sauvegardé), `src/sim/legacy.ts` (`perkYield` : le bonus), `src/sim/kingdom.ts` (`claimKingdom` : le bâton repris), `src/kingdomEnd.ts` et `src/kingdomStage.ts` (le plan « le bâton rendu »), `src/render/battleUnits.ts` (le roi démon tient le bâton), `src/ui/worldChoice.ts`, `src/ui/ways.ts`, `src/ui/command.ts`, `src/sim/objective.ts`, `src/portalCine.ts`, `src/openingCine.ts`, `src/ui/kingdom.ts` (les textes qui disent le but), `src/ui/staffIcon.ts` (l'icône du bâton), `src/audio/audio.ts` (scène `theft`), `src/main.ts` (`stealStaff`, `showGrandChoice`, `playPortalCine`, `syncTrophies`), `src/style.css` (`#staffCine`), `src/hudTheme.css` (`.zst` de la frise)
> Tests : `tests/batonFondateur.test.ts`, `tests/cinematiqueFin.test.ts`, `tests/cinematiqueOuverture.test.ts`
> Voir aussi : [ouverture.md](ouverture.md), [grand-choix.md](grand-choix.md), [enfers.md](enfers.md), [fin-du-royaume.md](fin-du-royaume.md), [audio.md](audio.md), [sauvegarde.md](sauvegarde.md)

## En bref
Retour de l'auteur (26 nov. 2026) : aux Enfers, on se battait sans raison. Il a écarté une princesse enlevée (elle ne survivrait pas aux âges) et choisi **le bâton du fondateur** : le chef des nomades le plante au bord de la rivière dans le film d'ouverture, il reste sur la grande place à travers les âges, les démons le volent à la fin de l'Antiquité, et on le reprend au roi démon. Il rend alors un bonus durable.

## Le récit, moment par moment
1. **La fondation** (film d'ouverture, inchangé) : le chef plante son bâton. Le bandeau du plan en direct qui suit devient « Ici, le chef planta son bâton » (`OPEN_LIVE_CAPTION`).
2. **Le bâton sur la place** : dès qu'une grande place existe (le feu du clan de la Préhistoire, puis chaque place qui lui succède), le bâton s'y dresse, à une place à lui, habillé à la mode de l'âge **du modèle de la place** :
   - Préhistoire : planté dans un cercle de pierres, une coupe de baies, un crâne de cerf, une peau ;
   - Antiquité : devant une pierre levée gravée de spirales et de chevrons, une couronne de laurier, planté dans un bloc cerclé de bronze, jarre, fleurs, lampe à huile ;
   - Médiéval : tenu par deux ferrures contre le pilier d'un monument octogonal à degrés (petit toit, croix, écu), quatre cierges, une lanterne, un fanion ;
   - Industriel : dans la main d'une statue de bronze du fondateur encapuchonné, socle de granit, plaque, grille de fonte ;
   - Moderne : sous une vitrine (arêtes d'acier, spot), potelets de laiton et cordon rouge, lutrin ;
   - Futuriste : il flotte au-dessus d'un socle de nacre, dans une colonne de lumière et ses anneaux.

   Le bâton lui-même ne change pas : bois noueux, poignée de cuir, bandes rouges et or, deux plumes, une pierre bleue qui luit (on le repère de loin, même la nuit). Il fait deux habitants de haut (`STAFF_K` = 0,8).
3. **Le vol** (cinématique en direct, ≈ 15 s, `staffCine.ts`) : à la fin de l'Antiquité, juste avant la carte du grand choix. La vue descend vers le bâton, le ciel s'assombrit ; la terre tremble, une faille rouge s'ouvre à côté de lui ; un chef démon, une brute et un diablotin en sortent, le chef arrache le bâton et le brandit ; tous redescendent avec lui, la faille se referme. Il reste le monument vide : une brûlure aux deux premiers âges, un crêpe noir au Médiéval, une main de statue vide, une vitrine vide, une colonne de lumière vide.
4. **Le grand choix** : la tuile des Enfers devient « Reprendre le bâton » (« Les démons l'ont emporté aux Enfers… »), la note dit que le bâton attendra aux Enfers. « Explorer le monde » ou « Ni l'un ni l'autre » : le bâton reste perdu, le monument vide reste sur la place. L'onglet « Grands choix » propose toujours d'ouvrir le portail plus tard (sa carte s'appelle alors « Reprendre le bâton »).
5. **Aux Enfers** : le film du portail dit « Au-delà, le bâton volé », la bannière d'arrivée « le bâton du fondateur est tout au fond, aux mains du roi démon », la frise du haut nomme la dernière zone « Le bâton » et y pose l'icône du bâton (halo bleu qui bat), l'infobulle de l'objectif rappelle le but, et l'objectif du royaume devient « abattre la citadelle et reprendre le bâton ». La bannière du royaume dit que le roi tient le bâton. **Le roi démon le brandit** à la place de son ancien sceptre à orbe.
6. **La reconquête** : la cinématique de la chute du roi a un plan de plus (`staff`, 4,5 s) : la vue glisse du village au monument, le bâton remonte de terre dans une gerbe dorée, la vue s'y pose (« Le bâton du fondateur revient sur la place »). L'écran de la victoire l'ajoute en tête des récompenses.

## Règles du jeu
- **États** (`StaffState`, `World.staff`) : `home` (sur la place), `stolen` (volé), `back` (repris). Le royaume tombé (perk `hellking`), il est repris quoi qu'il arrive (`staffNow`).
- **Le moment du vol, et pourquoi** : le vol doit précéder le choix, sinon « Explorer le monde » ne perdrait rien. Il se joue donc quand la carte du grand choix va s'ouvrir, d'elle-même ou au clic (`showGrandChoice`, `theftBeforeChoice`) : bâton sur la place, voie des Enfers possible sur la carte (île du portail), village encore à l'Antiquité. Dans l'ordre du récit, il reste « avant » la cinématique du portail : vol, choix, portail.
- **La règle de secours** : le bâton encore sur la place au moment de la cinématique du portail, le vol se joue d'abord (`playPortalCine`, `theftBeforePortal`). C'est le cas du bac à sable (pas de grand choix), d'une ancienne partie qui a fait le grand choix sans les Enfers, et d'une ancienne partie au Médiéval ou plus qui voit la carte tard (le vol ne s'y joue pas, pour ne pas surgir à l'improviste).
- **Le bonus** (perk `staff`, `STAFF_YIELD` = 1,2, `STAFF_KINDS`) : bois, pierre, minerai et briques +20 % (bûcherons, carrières, mines, briqueteries), cumulé aux autres savoir-faire (`perkYield` : les fiches et le bilan le montrent). Pourquoi celui-là : on le reprend au Futuriste (le royaume demande cet âge), quand il reste la fusée et les arcologies à bâtir, gourmandes en matériaux ; le roi donne déjà bien-être, minerai et équipement (voir [fin-du-royaume.md](fin-du-royaume.md)). Il ne touche ni la nourriture, ni l'or, ni les âges, et ne vient qu'une fois l'essentiel bâti, sans casser l'équilibre de [difficulte.md](difficulte.md) ni de [economie-ressources.md](economie-ressources.md).
- **Musique du vol** : « The Descent » de Kevin MacLeod (CC BY 4.0), scène `theft`, voir [audio.md](audio.md). Elle entre en fondu pendant le calme et éclate quand la faille s'ouvre.
- **Passer** : un clic, « Passer », Échap ou Espace, en deux temps, comme les autres cinématiques. Le bâton est volé quand même.

## Fonctionnement dans le code
- **Sur la place** : `Game.syncTrophies` (toutes les 0,5 s) appelle `FounderStaff.sync(place, état)` avec la grande place la plus proche du cœur du village (`plazaNear`, celle des trophées). Le monument est refait seulement quand la place change (lieu, rotation, âge du modèle, terrain) ou l'état. Le bâton est un maillage à part, enfant du monument : `hide` le cache, `lift` le fait monter de terre, `staffWorld` donne son pied, `center` le milieu de la place. Place par âge : `STAFF_SLOTS` (repère du modèle de la place, à l'écart des places des trophées et du décor de chaque âge, vérifiées en jeu), le tout tourné vers la vue d'ensemble (`VIEW_YAW` = 0,75, comme les trophées).
- **Le vol** : `Game.stealStaff(then)` lâche l'outil, note `World.staff = 'stolen'` et sauvegarde dès le départ (une partie rechargée pendant la cinématique ne la rejoue pas), puis `StaffStage.play`. Pendant qu'elle joue, la place montre encore le monument en état `home` (le bâton y est caché, la cinématique en anime une copie). Sans grande place, la cinématique ne se joue pas (`play` rend faux et appelle sa suite tout de suite) : le bâton est volé quand même.
- **La mise en scène** (`StaffStage.step`, temps réel, appelée après la caméra) : la faille (`riftMesh`) s'ouvre du côté le plus loin du milieu de la place, à 0,42 case du bâton (pas dans la fontaine ni sur les étals) ; ses braises montent tant qu'elle est ouverte. Les démons sont des maillages à part tirés de `demonParts` (chef 0,3, brute 0,34, diablotin 0,2 de haut), dans les matériaux communs `mats.body` et `mats.glow` : aucun shader neuf à préparer en pleine cinématique. Teinte du ciel et lueur de la faille en CSS (`.sc-tint`, `.sc-glow`). Sons : `sfxRumble` à l'ouverture et à la fermeture, `sfxRoar` à la sortie des démons.
- **Les gardes** : `popupBusy`, `cinematicPlaying`, `trophyCalm`, la vue du passage d'âge et la cinématique du portail attendent la fin du vol ; `stepCrossroads` aussi.
- **La reconquête** : `claimKingdom` ajoute le perk `staff` et `staff: true` à la récompense. `KingdomStage.playEnd` enfonce le bâton sous terre (`staff.rise(0)`), le plan `staff` le fait remonter (`staffRiseAt`), `endFinale` le remet à sa place (passée en route aussi). La rediffusion du mode développeur n'y touche pas.
- **Mesure** (26 nov. 2026, serveur muet, 1366 × 768) : 16 images par seconde avec ou sans la cinématique dans le panneau d'essai, qui bride l'affichage. Aucune baisse mesurable.

## Liens avec les autres systèmes
- [grand-choix.md](grand-choix.md) : la carte attend la fin du vol ; ses textes.
- [enfers.md](enfers.md) : la cinématique du portail, la frise, l'objectif, la bannière.
- [fin-du-royaume.md](fin-du-royaume.md) : le plan `staff`, la récompense.
- [economie-ressources.md](economie-ressources.md) : `perkYield`.

## Pièges et invariants
- **Sauvegardes** : `World.staff` est écrit dès qu'il est connu. Absent (partie d'avant lui), `readStaff` rend `null` et `Game` le déduit une fois la guerre chargée (`staffOfOld`) : royaume tombé, `back` (et le perk `staff` est ajouté : le bonus compte) ; Enfers déjà visités ou cinématique du portail vue (`War.visited`, `intro === 'seen'`), `stolen`, sans cinématique ; sinon `home`, et le vol viendra en son temps (à la carte encore à l'Antiquité, ou juste avant la cinématique du portail). Jamais de vol rejoué à l'improviste.
- Le monument suit l'âge **du modèle** de la place (`plaza.age`), pas l'âge du village : une place pas encore évoluée garde son monument.
- `STAFF_FOOT` (le pied du bâton dans chaque monument) doit suivre les appels de `staffParts` dans `age0` … `age5`.
- Le roi démon tient le bâton même dans une partie où il n'a pas été volé (mode développeur) : sans conséquence.

## Pour modifier
- **Le modèle d'un âge** : `age0` … `age5` de `founderStaff.ts` (et `STAFF_FOOT`) ; sa place : `STAFF_SLOTS` (à vérifier en jeu, de la vue d'ensemble et de près).
- **La cinématique** : durées et bandeaux dans `staffCine.ts` (tests `batonFondateur.test.ts`), caméra et démons dans `StaffStage.camera` et `animate`.
- **Le bonus** : `STAFF_YIELD`, `STAFF_KINDS` (`sim/staff.ts`), la ligne `KINGDOM_TEXT.staff`.
