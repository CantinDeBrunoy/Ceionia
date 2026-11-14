# Le grand choix de la fin de l'Antiquité

> Fichiers : `src/sim/crossroads.ts` (règles pures : état des deux voies, quand la carte s'ouvre, quand l'onglet se montre), `src/ui/worldChoice.ts` (la carte : trois réponses, ou une seule voie), `src/ui/ways.ts` (l'onglet « Voies » des expéditions), `src/ui/voyage.ts` (bandes noires et traversée de la cinématique), `src/ui/loading.ts` (`LoadingScreen` en mode traversée), `src/main.ts` (`stepCrossroads`, `ways`, `takeWay`, `openHell`, `exploreWorld`, `revealIsles`, `boot`), `src/ui/ui.ts` (`openExpeditions`, onglet `ways`), `src/sim/war.ts` (`War.wake`), `src/world/world.ts` (`crossroads`, `portalWoken`), `src/hudTheme.css` (styles « le grand choix »), `src/style.css` (styles « La traversée »)
> Tests : `tests/grandChoix.test.ts`
> Voir aussi : [portail-ile.md](portail-ile.md), [monde-carte.md](monde-carte.md) (« Explorer le monde »), [diplomatie.md](diplomatie.md), [expeditions.md](expeditions.md), [ages.md](ages.md), [bac-a-sable.md](bac-a-sable.md), [sauvegarde.md](sauvegarde.md)

## En bref
Deux contenus de fin de partie arrivaient en même temps au début du Médiéval : le portail des Enfers (PvE) et l'archipel (deux îles rivales). Le joueur était perdu. Décision de l'auteur (14 nov. 2026) : à la fin de l'Antiquité, **une seule carte, trois réponses** : « Les Enfers », « Explorer le monde », « Ni l'un ni l'autre ». Le choix est **obligatoire pour passer au Médiéval** (précision de l'auteur : « Ce choix doit être obligatoire pour monter d'âge… la pop-up doit apparaître une fois qu'on a validé toutes les autres steps ») ; « Ni l'un ni l'autre » compte comme un choix. Rien n'est exclusif : la voie non prise (ou les deux) se lance plus tard depuis l'onglet **« Voies »** du menu des expéditions. Le jeu **ne guide pas** vers cet onglet : ni message, ni bulle d'aide, ni ligne en tête d'un rayon. Pas de repères ajoutés non plus (noms d'îles, « Aller à… », minicarte).

## Règles du jeu
### La carte
- **Une condition du passage au Médiéval** : la dernière ligne du panneau des âges à l'Antiquité, « le grand choix » (`CHOICE_LABEL`, `Sim.ageProgress`, 0/1). Elle est remplie quand le choix est fait (`World.crossroads`), quand une voie est déjà prise (portail ouvert, archipel accepté) ou quand aucune n'est possible sur la carte (`crossroadsMet`) : personne n'est bloqué. Tant qu'elle manque, `Sim.ready` est faux et « Passer à » ne fait rien.
- La carte s'ouvre **d'elle-même** à l'Antiquité quand **toutes les autres conditions** du Médiéval sont remplies (`crossroadsDue(…, othersDone)`), au calme comme les autres fenêtres automatiques (3 s après l'écran de chargement, `popups` ouverts, sans tutoriel actif), une fois par session (`Game.crossroadsAsked`). Une ancienne partie déjà au Médiéval ou plus, passée sans lui, la voit tout de suite (une fois). Jamais au bac à sable (pas de conditions d'âge).
- **Fermée sans choix** (la croix en haut à droite), elle ne revient pas seule dans la session : un clic sur la condition du panneau des âges, ou sur le conseil du moment (« Pour l'âge suivant : faites le grand choix… (cliquez ici) », `Sim.messageChoice`), la rouvre (`Game.openCrossroads`).
- Deux tuiles côte à côte, le diorama qui déborde en haut de chacune : « Les Enfers » (violette, l'arche du portail) et « Explorer le monde » (dorée, la caravelle) ; puis « Ni l'un ni l'autre » (crème) sur toute la largeur. Une voie impossible sur la carte (pas d'île du portail ; monde qui ne peut plus s'agrandir) est grisée avec sa raison. La note dit « Il faut choisir pour passer au Médiéval. Rien n'est définitif : l'autre voie restera ouverte », sans dire où.
- **Les Enfers** : le portail s'ouvre tout de suite, **sans expédition** (`World.portalWoken`), et le joueur affronte les démons d'emblée (`War.wake` : `pve = 'on'`, `choiceSeen`). Pas de seconde carte « affronter / refermer » : le grand choix la remplace, comme il remplace l'expédition « Le portail de l'autre rive ». La vue va sur l'île (`pveStart` : chapitre `pve` du tutoriel, `commandIsle`).
- **Explorer le monde** : la cinématique (ci-dessous), la carte s'agrandit à l'archipel (`expandWorld`), les deux îles apparaissent.
- **Ni l'un ni l'autre** : rien ne change ; `crossroads` passe à vrai.
- Chaque réponse marque `World.crossroads` (sauvegardé) : la carte ne revient plus.

### L'onglet « Voies » des expéditions
- Bouton « Voies » (boussole) à droite de la barre des expéditions, au Médiéval et après (au bac à sable, tout de suite), dès qu'une voie existe sur la carte (`waysTabShown`).
- Deux cartes comme celles des missions (diorama du portail, de la caravelle) : la voie à prendre a son bouton (« Ouvrir le portail », « Explorer le monde ») ; la voie prise le dit (« Facultatif · ✓ voie prise ») sans bouton ; une voie impossible n'a pas de carte.
- Le bouton ferme la fenêtre et ouvre la carte de cette seule voie pour confirmer (`WorldChoice.show(way)` : la voie et « Pas maintenant »). Le portail déjà ouvert mais refermé, ou jamais affronté (ancienne partie, bac à sable : état `ask`), ouvre plutôt la carte du portail (« Affronter les démons » / « Garder le portail fermé »).

### La cinématique « Explorer le monde » (à la place de l'écran de chargement)
1. Les bandes noires descendent (`Letterbox`, `body.cinematic` cache l'interface), légende « Vos navigateurs mettent le cap au large… » ; la vue file, basse (pitch 0,32, 46 de recul), vers le bord de carte le plus proche du village, tournée vers le large (2,6 s).
2. La traversée monte en fondu (0,9 s) : la mer peinte en CSS (ciel d'aube, soleil voilé, houle, brume) et le diorama de la caravelle qui tangue. Derrière elle, la partie est sauvegardée, agrandie et rechargée (`AUTOSTART` = `carte|continue|voyage`).
3. Au rechargement, `boot` lit `voyage` et pose le même écran (`LoadingScreen(app, true)`, id `loadScreen`, classe `voyage`) : pas de logo ni de conseil, l'avancée en mince filet doré sous la légende. Le joueur ne voit pas d'écran de chargement, seulement la traversée qui continue.
4. L'écran s'efface : la vue est déjà au-dessus de la mer de l'archipel (`cam.jump`), le survol part aussitôt (`Game.voyage`, sans les 3 s d'attente) : la mer, l'île rivale A, l'île B (légendes dans la bande du bas, à la place des bannières), puis le village (13,2 s). Les bandes remontent, l'interface revient, `onIslesRevealed` enchaîne (message du premier contact).
Une partie rechargée autrement avec la cinématique en attente (`world.reveal`) la joue au calme, partant du village, sous les mêmes bandes.

## Fonctionnement dans le code
- **États des voies** (`crossroads.ts`) : `hellWay(w, pve)` = `none` (pas d'île), `open` (portail fermé), `ask` (ouvert sans qu'on affronte : `pve` `ask` ou `off`), `taken` (`pve === 'on'`). `worldWay(w, canExplore)` = `taken` (`archipelagoOn`), `open` (`canExpand` : continent de 192, version 3), `none`. `Game.ways()` les calcule.
- **`Game.stepCrossroads`** (chaque image, dans `stepWar`) : d'abord la cinématique en attente (`world.reveal`, `revealReady`), puis, tant que `crossroads` est faux, `crossroadsSettled` (une voie déjà prise ou en suspens, ou aucune possible) marque `crossroads` sans rien montrer ; sinon, au calme et si elle ne s'est pas déjà ouverte dans la session, `crossroadsDue` ouvre la carte (`othersDone` : toutes les lignes de `ageProgress` sauf `CHOICE_LABEL` remplies).
- **La condition** (`Sim.ageProgress`, passage vers `CROSSROADS_AGE`) : `crossroadsMet(w, hellWay(w, 'ask'), worldWay(w, canExpand(…)))` (la simulation ne connaît pas `War.pve`, inutile ici : `ask` et `taken` remplissent pareil). Le panneau des âges la reconnaît à son libellé (`reqOf` → `choice`).
- **`Game.openHell`** : `crossroads = true`, puis `portalWoken = true` et `War.wake()` si le portail était fermé (sinon `acceptPve`), `pveStart`, sauvegarde. `War.wake` efface `legacyInv` : une ancienne sauvegarde sans état d'invasion, au Médiéval, l'aurait crue faite (`readLegacyInvasion` : âge ≥ 2) ; `acceptPve` efface `legacyPve` (sans quoi `readLegacyPve` récrirait le choix).
- **`Game.exploreWorld`** : bloque les autres fenêtres (`revealing`), bandes, mouvement, traversée, puis `buildSave` → `expandWorld` → `exploredAt` → `saveSlot` → rechargement. `Game.voyage` est posé par `boot` (`voyage && world.reveal`).
- **Bac à sable** : le portail s'éveille seul à l'Antiquité et la carte du portail arrive comme avant (voir [bac-a-sable.md](bac-a-sable.md)) ; pas de grand choix ; l'onglet « Voies » est là dès le départ (« Explorer le monde », et « Affronter les démons » si le portail est refermé).

## Liens avec les autres systèmes
- [portail-ile.md](portail-ile.md) : le portail ouvert par le grand choix ; la carte du portail ne s'ouvre plus d'elle-même que pour un portail ouvert autrement (bac à sable, expédition d'une ancienne partie).
- [monde-carte.md](monde-carte.md) : `expandWorld`, `canExpand`, `archipelagoOn`.
- [expeditions.md](expeditions.md) : l'expédition `portal` n'est plus proposée ; l'onglet « Voies ».
- [ages.md](ages.md) : plus rien du portail pour sortir de l'Antiquité.

## Pièges et invariants
- **Anciennes sauvegardes** : sans `crossroads`, la partie n'a pas choisi. Une partie encore à l'Antiquité reçoit la condition (remplie d'office si son portail est déjà ouvert). Un portail déjà ouvert (même refermé) ou un archipel accepté marque le choix fait au premier pas (rien ne change). Une partie au Médiéval ou plus, sans l'un ni l'autre (même restée sur son île à l'ancienne carte « Explorer le monde », `explore: 'no'`), voit la carte une fois. `World.explore` n'est plus lu, mais toujours relu et réécrit.
- Une ancienne partie qui a l'expédition du portail **en route** la garde visible (`Expeditions.list`) jusqu'au retour ; réussie, elle ouvre le portail (`exp.done`) et la carte du portail s'ouvre comme avant.
- Le survol démarre dès que `#loadScreen` disparaît quand `voyage` est vrai : garder l'id `loadScreen` à l'écran de la traversée (toutes les gardes de fenêtres le lisent).
- `body.cinematic` cache les bannières : les légendes de la cinématique passent par `Letterbox.caption`, pas par `ui.banner`. À la fin, la classe n'est retirée que si ni le royaume ni un trophée ne la tiennent.
- Le jeu ne guide pas vers l'onglet : ne pas ajouter de message, de bulle ou de ligne de rayon qui y mène (décision de l'auteur).

## Pour modifier
- **Changer l'âge du choix** : `CROSSROADS_AGE` (la condition, `crossroadsDue`, `waysTabShown`).
- **Ajouter une voie** : un état dans `crossroads.ts`, une tuile dans `WorldChoice.grand`, une carte dans `waysHtml`, une branche dans `takeWay` ; tests dans `grandChoix.test.ts`.
- **Retoucher la cinématique** : durées dans `exploreWorld` et `revealIsles`, décor dans `VOYAGE_PLATE` et les styles « La traversée ».
