# Blason du village

> Fichiers : `src/sim/blason.ts` (teintes, emblèmes, formes, défaut, lecture, tirage, dessins SVG), `src/render/teamPaint.ts` (sentinelles, shader, texture de l'emblème), `src/render/parts.ts` (`Parts.add` écrit les sentinelles), `src/render/battleUnits.ts` (`paint` des Enfers, de même), `src/ui/blason.ts` (la fenêtre de choix), `src/ui/ui.ts` (ligne de Paramètres › Partie), `src/main.ts` (`Game.setBlason`, `setIsleName`, `askBlason`), `src/world/world.ts` (champs sauvés), `src/hudTheme.css` (`.vName`)
> Tests : `tests/blason.test.ts`
> Voir aussi : [rendu-modeles.md](rendu-modeles.md), [armee-combat.md](armee-combat.md), [interface.md](interface.md), [sauvegarde.md](sauvegarde.md), [diplomatie.md](diplomatie.md) (les blasons des deux peuples rivaux)

## En bref
Le village du joueur a **un seul drapeau** : deux couleurs (le champ, l'emblème), un emblème et une forme. Il flotte sur tous ses bâtiments, ses navires et sa base des Enfers, et sur la Lune (la retransmission de l'alunissage, `moonFlag` dans `ui/spaceViews.ts`, voir [fin-de-partie.md](fin-de-partie.md)), et ses troupes en portent les couleurs (tabards, boucliers, panaches, capes, caparaçons). Avec lui, le joueur nomme **son île** : le nom s'affiche en haut à gauche, à la place du titre du jeu. Le joueur choisit les deux au début d'une partie neuve (facultatif) et le change quand il veut dans l'onglet « Blason » de la fenêtre des expéditions (ou dans Paramètres › Partie) : tout le jeu se teint à l'image suivante, sans rien recharger.

## Règles du jeu
- Teintes (`BLASON_COLORS`) : azur, bleu nuit, pourpre, bordeaux, gueules (rouge), sinople (vert), ocre, or, argent, sable (noir). **Ni turquoise ni rouge laqué** : ce sont les couleurs des Sablais et des Jadéens (test).
- Emblèmes (`EMBLEMS`) : montagne, soleil, arbre, épis, étoile, vagues, tour, couronne. Pas de lion : illisible sur un petit drapeau.
- Formes (`SHAPES`) : droit, à queue d'aronde, en flamme. Une bannière pendue se découpe en bas, un drapeau au bout opposé à la hampe ; un écu, un bouclier, un tabard ne se découpent pas.
- Défaut (`DEFAULT_BLASON`) : azur et or à la montagne, droit (les sommets du titre du jeu).
- Les deux couleurs sont toujours différentes (la fenêtre échange les deux si on choisit la même ; `readBlason` corrige une sauvegarde qui les aurait égales).
- Le métal reste métal : casques, cuirasses, bords et ombilics d'or ne changent pas. Restent aussi à leurs couleurs : la croix rouge des hôpitaux, le drapeau rouge du chef de gare, les enseignes, les pavillons de signaux, les couleurs des jouteurs et des équipes, le cirque, la fête foraine, le carnaval, les fanions des équipes d'expédition (une couleur par équipe), les navires et soldats des peuples rivaux.

### Le nom de l'île
- Retour de joueurs (« afficher le nom de l'île »), décision de l'auteur du 22 nov. 2026 : « choisi par le joueur en même temps que son blason, affiché en jeu ».
- Champ « Nom de l'île » en tête des choix (`blasonPickerHtml`, `[data-isle]`), dans la fenêtre comme dans l'onglet Blason. Chaque frappe le nettoie (`readIsleName` : sans caractères de contrôle ni chevrons, espaces resserrés, `ISLE_MAX` = 22 lettres au plus ; vide : le nom par défaut). Les chevrons et caractères de contrôle s'effacent aussi dans la case même, et un compteur (`.blCount`, « 12/22 ») dit la limite : un nom collé avec des balises se retrouvait coupé sans prévenir (testeur, 26 nov. 2026). Dans l'onglet, il est changé et sauvé aussitôt (`Game.setIsleName`) ; dans la fenêtre, à « Valider » (`chooseBlason` rend `{ blason, isle }`). Les touches tapées ne partent pas au jeu (`stopPropagation`), Entrée quitte le champ.
- « Au hasard » tire aussi un nom (`randomIsleName`, liste `ISLE_NAMES` de vingt noms propres, jamais le nom en cours ; ils ne se traduisent pas).
- Affichage : `.vName` de la carte du village, en haut à gauche (`UI.update`), avec l'infobulle « L'île de … ». Un nom long prend une lettre plus petite, jusqu'à 14 px, puis des points de suspension (le cadre fait 140 px).
- Défaut et anciennes parties : `DEFAULT_ISLE` = « Ceionia », le titre qu'affichait déjà la carte : rien ne change pour qui n'y touche pas.

## Fonctionnement dans le code

### Les sentinelles (`teamPaint.ts`)
Une pièce « au blason » reçoit au lieu d'une couleur un nombre négatif :
| Sentinelle | Pour | Ce que dessine le shader |
|---|---|---|
| `TEAM_A`, `team(TEAM_A, nuance)` | tissu de la couleur principale | `uTeamA × nuance` |
| `TEAM_B`, `team(TEAM_B, nuance)` | liseré, plumet, parement | `uTeamB × nuance` |
| `TEAM_FLAG` / `TEAM_FLAG_R` | toile d'un drapeau, hampe du côté du plus petit / plus grand x (ou z) local | champ, emblème, découpe de la forme au bout |
| `TEAM_BANNER` | bannière pendue | champ, emblème, découpe en bas |
| `TEAM_EMBLEM` | écu, bouclier, tabard, flanc d'un char | champ et emblème, sans découpe |

`Parts.add` (et `paint` des Enfers) écrit la couleur des sommets avec un **canal bleu négatif** (aucune vraie couleur ne l'est) : environ −1 (principale), −4 (emblème), −16 (drapeau), −64 (bannière), −256 (écu) ; le rouge porte la nuance, ou pour un champ la place sur la toile (u, de la hampe au bout) ; le vert la hauteur (v) plus, en partie entière, le rapport largeur / hauteur en dixièmes. Le champ se mesure sur la pièce **avant sa pose** (ses positions locales). L'occlusion factice de `Parts.build` et la nuance de `paint` multiplient les trois canaux d'un même facteur : le bleu le rend, le shader le retire.

### Le shader
`addTeamPaint(matériau)` greffe après `color_fragment` : si `vColor.b < −0,45`, la couleur vient des uniforms `uTeamA`, `uTeamB` (couleurs linéaires) ; sur un champ, l'emblème est lu dans `emblemTex` (canvas 128 × 128, une seule pour tout le jeu, redessiné quand l'emblème change) dans un carré de 0,74 de la hauteur, centré (à 0,42 de la longueur pour une forme découpée), et la forme (`uTeamShape`) fait `discard` hors de la toile. Matériaux greffés : `mats.body`, `mats.glow`, `mats.lit`, `mats.ghost`, `crowdMat` (`materials.ts`), ceux des portraits de troupes (`troopPortraits.ts`), le matériau `lit` de la base des Enfers (`hellView.ts`, `hellThumbs.ts`). Le drapeau de la base des Enfers est un plan d'une couleur : `teamFlagColor` lui donne pour couleur l'objet `uTeamA` lui-même.

### Changer de blason
`setTeamBlason(b)` met à jour les uniforms et redessine la texture si l'emblème change ; `teamVersion` monte (les portraits de troupes rendus une fois se refont). Aucune géométrie, aucun cache de modèle n'est touché. `Game.setBlason` le sauve dans `world.blason`. La fenêtre appelle `setTeamBlason` à chaque clic (aperçu en direct) et le rappelle avec l'ancien blason si on la ferme sans valider.

### Fenêtre (`ui/blason.ts`) et sauvegarde
- `chooseBlason(racine, blason, premier, aperçu)` : fenêtre peinte (`menuPop`, classe `blasonPick`) : aperçu du drapeau (`flagSvg`, mêmes proportions que le shader) et d'un soldat (`soldierSvg`), deux rangées de teintes, les huit emblèmes, les trois formes ; « Au hasard » (`randomBlason` : un emblème clair sur un champ sombre et l'inverse), « Plus tard » au premier lancement, « Valider ».
- Partie neuve : `askBlason` après `askControls` (dans `start`), seulement si `world.blasonSeen` est faux ; « Plus tard » ou la croix le passent à vrai.
- Onglet « Blason » de la fenêtre des expéditions (`openExpeditions('blason')`) : le même choix, en place (`blasonPickerHtml` rend le corps, `bindBlasonPicker` le branche ; la fenêtre les reprend aussi). Chaque clic appelle `Game.setBlason` : pas de « Valider », le blason est changé et sauvé aussitôt. Tient en 1280 × 720 sans défiler.
- Paramètres › Partie : la ligne « Blason du village » (petit drapeau, « Changer le blason »), qui ouvre la fenêtre.
- Sauvegarde : `world.blason` (`{ a, b, e, s }`, toujours écrit), `blasonSeen` (1 si vu) et `isleName` (écrit s'il n'est pas « Ceionia »). Absent (ancienne partie) : le blason par défaut, et la fenêtre ne s'ouvre pas d'elle-même.

## Pièges et invariants
- **Ne jamais calculer sur une sentinelle** (`new THREE.Color(TEAM_A)`, `lerp`, `multiplyScalar`) : elle n'est pas une couleur. `dark` de `soldiers.ts` et `riders.ts` passe par `teamShade` ; une autre aide qui assombrit doit faire de même.
- Une sentinelle n'a de sens que sur un matériau greffé (`addTeamPaint`). Un nouveau matériau à couleurs de sommets qui dessine des pièces du village doit être greffé, sinon elles sortent noires.
- Pas de sentinelle sur une lumière (`glow`) : l'éclat des néons se calcule sur la couleur dans le vertex shader. Un étendard néon garde sa toile au blason sans éclat et un liseré lumineux à part (remparts futuristes).
- Le champ d'un drapeau se mesure sur la boîte locale : une toile doit être une seule pièce (pas de queue ni de losange à part, la forme et l'emblème les remplacent). Un liseré par-dessus l'emblème le cacherait.
- `vesselModel(sorte, false)` : les navires marchands des îles rivales ne portent pas notre pavillon (clé de cache séparée).
- Les ombres des drapeaux découpés gardent la forme rectangulaire (le matériau des ombres n'est pas greffé) ; à peine visible.
- Le monde souterrain (retiré, `camp.ts`, `underView.ts`) n'est pas converti.

## Pour modifier
**Mettre une pièce au blason** : passer `TEAM_A` / `TEAM_B` (ou `team(TEAM_A, 0.8)`) pour un tissu, `TEAM_FLAG` / `TEAM_BANNER` / `TEAM_EMBLEM` pour une toile ou un écu (une seule boîte, l'emblème au milieu) ; importer depuis `./teamPaint` ; vérifier le matériau.
**Ajouter un emblème** : un tracé dans le carré de 100 (`EMBLEM_PATH`, éventuellement une ouverture dans `EMBLEM_HOLE`), son nom dans `EMBLEMS` et `EMBLEM_NAME`, la traduction (`src/i18n/en/ui.ts`).
**Ajouter un nom d'île au tirage** : `ISLE_NAMES` (22 lettres au plus, test `tests/blason.test.ts`).
**Ajouter une teinte** : `BLASON_COLORS` et `COLOR_NAME` (ni turquoise ni laque rouge), la traduction.
