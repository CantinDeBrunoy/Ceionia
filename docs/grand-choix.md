# Le grand choix de la fin de l'Antiquité

> Fichiers : `src/sim/crossroads.ts` (règles pures : état des deux voies, quand la carte s'ouvre, quand l'onglet se montre), `src/ui/worldChoice.ts` (la carte : trois réponses, ou une seule voie), `src/ui/ways.ts` (l'onglet « Voies » des expéditions), `src/voyageCine.ts` (la partition de la cinématique : plans, bandeaux, fondus), `src/voyageStage.ts` (sa mise en scène : navires, caméra, habillage), `src/ui/voyage.ts` (l'écran d'attente : brume et navire en ombre), `src/ui/loading.ts` (`LoadingScreen` en mode traversée), `src/main.ts` (`stepCrossroads`, `ways`, `takeWay`, `openHell`, `exploreWorld`, `revealIsles`, `boot`), `src/ui/ui.ts` (`openExpeditions`, onglet `ways`), `src/sim/war.ts` (`War.wake`), `src/world/world.ts` (`crossroads`, `portalWoken`), `src/hudTheme.css` (styles « le grand choix »), `src/style.css` (styles de la cinématique « Explorer le monde »)
> Tests : `tests/grandChoix.test.ts`, `tests/cinematiqueVoyage.test.ts`
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
- **Ni l'un ni l'autre** : rien ne change ; `crossroads` passe à vrai (l'onglet « Voies » apparaît).
- Chaque réponse marque `World.crossroads` (sauvegardé) : la carte ne revient plus.

### L'onglet « Voies » des expéditions
- Bouton « Voies » (boussole) à droite de la barre des expéditions, une fois le grand choix fait (`World.crossroads` ; décision de l'auteur : « Après le grand choix »), et au bac à sable dès le départ, s'il existe une voie sur la carte (`waysTabShown`). Rien ne le signale.
- Une carte par voie (`ui/ways.ts`, styles « l'onglet Voies » de `hudTheme.css`), dans l'habillage de la carte du grand choix : parchemin bordé d'or (violet pour les Enfers), diorama en tête (l'arche du portail, la caravelle), nom en Fraunces souligné d'un filet doré, une phrase d'envie, deux pastilles « ce qu'elle ouvre », le pavé d'état en haut à droite, le bouton d'or en pied.
- Trois états (`wayBadge`) :
  - **Disponible** : pavé doré et bouton « Ouvrir le portail » (« Rouvrir le portail » s'il a été refermé) ou « Explorer le monde ». C'est la voie non prise, ou les deux après « Ni l'un ni l'autre ».
  - **Voie ouverte** : pavé vert, une phrase dit ce qui est là, pas de bouton.
  - **Pas sur cette carte** : pas d'île du portail, ou monde qui ne peut plus s'agrandir. Carte grisée, pas de bouton.
- Le bouton ferme la fenêtre et ouvre la carte de cette seule voie pour confirmer (`WorldChoice.show(way)` : la voie et « Pas maintenant »). Le portail refermé (état `ask` de la voie) ouvre plutôt la carte du portail (« Affronter les démons » / « Garder le portail fermé ») ; ouvert sans choix (ancienne partie, bac à sable), c'est la carte de la voie des Enfers, qui passe `pve` à `on`.
- Au téléphone (≤ 640 px), les deux cartes s'empilent.

### La cinématique « Explorer le monde » : elle fait office de chargement
Demande de l'auteur : « il faut une vraie cinématique comme celle de fin. Elle fera office de chargement ». L'habillage est celui de la cinématique de fin du volet militaire (`#kingCine`) : bandes noires, bandeaux dorés, fondus, « Passer ». La partition est dans `voyageCine.ts` (testée), la mise en scène dans `voyageStage.ts`. Deux actes, de part et d'autre du rechargement de la partie agrandie.

1. **Acte I** (monde d'avant, `VOY_ACT1`, ≈ 9 s) :
   - **le départ** (5,5 s) : une caravelle sort de la côte du village et file vers le large. La vue la suit de trois quarts arrière, basse. Bandeau « Un navire prend la mer · Cap sur l'inconnu ». Le départ est choisi par `seaRay` : parmi seize directions autour du village, la côte la plus proche d'où la mer reste libre jusqu'au bord de la carte (ni lac ni rivière) ;
   - **la brume** (3,5 s) : un voile de brume monte et couvre tout (« La brume se lève… »).
2. **L'attente** : la même brume, à l'identique, avec un navire en ombre chinoise qui tangue et des nappes qui passent (`VOYAGE_PLATE`). Le bandeau dit « Au-delà de la brume… · le monde s'agrandit ». Elle couvre deux étapes :
   - la sauvegarde, l'agrandissement (`expandWorld`) et le rechargement (`AUTOSTART` = `carte|continue|voyage`) ;
   - au rechargement, `boot` pose le même écran (`LoadingScreen(app, true)`, id `loadScreen`). Il reste pendant le chargement des modèles, la génération des îles et des villes, la préparation des shaders et les premières images.

   Elle tient sans coupure aussi longtemps qu'il le faut ; l'avancée n'est qu'un mince filet doré.
3. **Acte II** (monde agrandi, `VOY_ACT2`, ≈ 32 s). Il démarre dès la première image (`Game.voyage`), sous l'écran d'attente : tant que `#loadScreen` est là, son temps est arrêté et sa brume tenue. Une fois l'écran parti, la même brume se dissipe (`VOY_LIFT` = 2,6 s), puis un fondu au noir (`VOY_DIP`) sépare chaque plan :
   - **l'horizon** (6,5 s) : une caravelle part du bord de l'île principale, cap sur les deux îles. La vue, au ras de l'eau derrière elle, recule et s'élève : les îles paraissent au loin (« La mer s'ouvre · et l'horizon recule ») ;
   - **l'île d'Orient** (7 s) : la ville vue de la mer, en tournant de sa mosquée vers son port, d'où sortent deux navires (« Une île de sable et de palmiers · Sa mosquée, son port, tout un peuple ») ;
   - **l'île d'Asie** (7 s) : de même, sa pagode et ses jonques ;
   - **les flottes** (7 s) : au milieu du bras de mer (`navalSites().battle`), trois navires de chaque peuple s'avancent les uns vers les autres, vus de côté au ras de l'eau (« Deux peuples, deux flottes · Une vieille rivalité les oppose ») ;
   - **le retour** (4,5 s) : la vue revient au village et s'y pose, sans bandeau.

   À la fin, l'interface revient et la carte du choix de l'allié s'ouvre (`onIslesRevealed`, voir [diplomatie.md](diplomatie.md)). `VOY_CONTACT` (l'ancienne bannière du premier contact) n'est plus affichée.

- **Navires** : la caravelle est le navire de commerce (`vesselModel('caravel')`). Ceux des deux peuples sont leurs navires de guerre (`warshipModel(warshipKind(peuple, max(âge, 2)))`), donc des boutres et des jonques même à l'Antiquité. Tout est préparé au début de l'acte (chemins, modèles) : rien ne se calcule en plein plan.
- **Musique** : le morceau de l'exploration (`medieval-exploration`, scène `voyage`, `SCENE_TRACKS` dans `audio.ts`), au volume de la musique, choisi par `main.ts` tant que `voyageStage.playing`. Après le rechargement, le navigateur ne laisse le son repartir qu'au premier geste du joueur (un clic qui passe la cinématique, par exemple).
- **Passer** : un clic n'importe où, Échap ou Espace. Dans l'acte I, on file à la brume (le rechargement suit) ; dans l'acte II, on va tout de suite à la fin. Jamais pendant l'attente : le bouton est caché et le clic sans effet tant que le chargement n'est pas fini.
- **Une seule fois** : `world.reveal` (sauvegardé) demande l'acte II. Il passe à faux quand l'acte commence, et la sauvegarde qui suit la fin ne le porte plus : une partie rechargée ensuite ne rejoue rien. Une partie rechargée autrement pendant l'acte II (onglet fermé) le rejoue une fois, au calme, ouvert par un fondu au noir au lieu de la brume.
- **Les Enfers, ni l'un ni l'autre** : pas de plan de transition. « Les Enfers » mène déjà la vue sur l'île du portail (`commandIsle`), qui glisse jusqu'à elle ; « Ni l'un ni l'autre » ne change rien à l'écran.

## Fonctionnement dans le code
- **États des voies** (`crossroads.ts`) : `hellWay(w, pve)` = `none` (pas d'île), `open` (portail fermé, ou ouvert sans choix : `pve` `ask`), `ask` (ouvert puis refermé : `pve` `off`), `taken` (`pve === 'on'`). `worldWay(w, canExplore)` = `taken` (`archipelagoOn`), `open` (`canExpand` : continent de 192, version 3), `none`. `Game.ways()` les calcule.
- **`Game.stepCrossroads`** (chaque image, dans `stepWar`) : d'abord la cinématique en attente (`world.reveal`, `revealReady`), puis, tant que `crossroads` est faux, `crossroadsSettled` (une voie déjà prise ou en suspens, ou aucune possible) marque `crossroads` sans rien montrer ; sinon, au calme et si elle ne s'est pas déjà ouverte dans la session, `crossroadsDue` ouvre la carte (`othersDone` : toutes les lignes de `ageProgress` sauf `CHOICE_LABEL` remplies).
- **La condition** (`Sim.ageProgress`, passage vers `CROSSROADS_AGE`) : `crossroadsMet(w, hellWay(w, 'ask'), worldWay(w, canExpand(…)))` (la simulation ne connaît pas `War.pve`, inutile ici : `ask` et `taken` remplissent pareil). Le panneau des âges la reconnaît à son libellé (`reqOf` → `choice`).
- **`Game.openHell`** : `crossroads = true`, puis `portalWoken = true` et `War.wake()` si le portail était fermé (sinon `acceptPve`), `pveStart`, sauvegarde. `War.wake` efface `legacyInv` : une ancienne sauvegarde sans état d'invasion, au Médiéval, l'aurait crue faite (`readLegacyInvasion` : âge ≥ 2) ; `acceptPve` efface `legacyPve` (sans quoi `readLegacyPve` récrirait le choix).
- **`Game.exploreWorld`** : bloque les autres fenêtres (`revealing`), `voyageStage.playAct1`, puis, la brume tombée, l'écran d'attente, `buildSave` → `expandWorld` → `exploredAt` → `saveSlot` → rechargement. `Game.voyage` est posé par `boot` (`voyage && world.reveal`) ; `revealIsles` lance `playAct2` (brume si `voyage`), et sa fin rend la main (`revealing` faux, `onIslesRevealed`, sauvegarde). `VoyageStage.update` est appelé à chaque image avec le temps réel (plafonné à 0,1 s).
- **Bac à sable** : le portail s'éveille seul à l'Antiquité, sans carte ni invasion (voir [bac-a-sable.md](bac-a-sable.md)) ; pas de grand choix ; l'onglet « Voies » est là dès le départ (« Les Enfers » pour affronter les démons, « Explorer le monde »).

## Liens avec les autres systèmes
- [portail-ile.md](portail-ile.md) : le portail ouvert par le grand choix ; la carte du portail ne s'ouvre plus d'elle-même, elle ne sert qu'à rouvrir un portail refermé.
- [monde-carte.md](monde-carte.md) : `expandWorld`, `canExpand`, `archipelagoOn`.
- [expeditions.md](expeditions.md) : l'expédition `portal` n'est plus proposée ; l'onglet « Voies ».
- [ages.md](ages.md) : plus rien du portail pour sortir de l'Antiquité.

## Pièges et invariants
- **Anciennes sauvegardes** : sans `crossroads`, la partie n'a pas choisi. Une partie encore à l'Antiquité reçoit la condition (remplie d'office si son portail est déjà ouvert). Un portail dont on affronte les démons (`on`) ou qu'on a refermé (`off`), ou un archipel accepté, marque le choix fait au premier pas (rien ne change). Un portail ouvert en attente (`ask` : l'expédition réussie sans réponse à l'ancienne carte du portail) tombe dans le grand choix ; « Les Enfers » y passe `pve` à `on`. Une partie au Médiéval ou plus, sans l'un ni l'autre (même restée sur son île à l'ancienne carte « Explorer le monde », `explore: 'no'`), voit la carte une fois. `World.explore` n'est plus lu, mais toujours relu et réécrit.
- Une ancienne partie qui a l'expédition du portail **en route** la garde visible (`Expeditions.list`) jusqu'au retour ; réussie, elle ouvre le portail (`exp.done`), sans carte : il tombe dans le grand choix (ou l'onglet « Voies » si le choix est déjà fait).
- L'acte II se tient sur la brume tant que `#loadScreen` existe (`VoyageHost.loading`) : garder l'id `loadScreen` à l'écran d'attente (toutes les gardes de fenêtres le lisent aussi). Son voile de brume (`#voyCine .vc-mist`, sous `#loadScreen`) a la même couleur que l'écran : l'écran s'efface sur lui sans coupure.
- `body.cinematic` cache les bannières : les bandeaux de la cinématique sont les siens (`.kc-cap`), pas `ui.banner`. À la fin, la classe n'est retirée que si la cinématique du royaume ne la tient pas ; la carte de l'allié s'ouvre après.
- Le jeu ne guide pas vers l'onglet : ne pas ajouter de message, de bulle ou de ligne de rayon qui y mène (décision de l'auteur).

## Pour modifier
- **Changer l'âge du choix** : `CROSSROADS_AGE` (la condition, `crossroadsDue`).
- **Ajouter une voie** : un état dans `crossroads.ts`, une tuile dans `WorldChoice.grand`, une carte dans `waysHtml`, une branche dans `takeWay` ; tests dans `grandChoix.test.ts`.
- **Retoucher la cinématique** : plans, durées, bandeaux et fondus dans `voyageCine.ts` (tests `cinematiqueVoyage.test.ts`) ; caméra et navires de chaque plan dans `VoyageStage.place` ; l'écran d'attente dans `VOYAGE_PLATE` et les styles de `style.css`.
