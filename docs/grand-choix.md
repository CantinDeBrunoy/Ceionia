# Le grand choix de la fin de l'Antiquité

> Fichiers : `src/sim/crossroads.ts` (règles pures : état des deux voies, quand la carte s'ouvre, quand l'onglet se montre), `src/ui/worldChoice.ts` (la carte : trois réponses, ou une seule voie), `src/ui/ways.ts` (l'onglet « Grands choix » des expéditions), `src/voyageCine.ts` (la partition de la cinématique : plans, bandeaux, fondus), `src/voyageStage.ts` (le survol en direct : navires, caméra, habillage), `src/ui/voyage.ts` (le film de la traversée et sa reprise après le rechargement, la brume dessous), `public/voyage/` (la vidéo, WebM et MP4), `index.html` (le fond couleur de brume pendant le rechargement), `src/ui/loading.ts` (`LoadingScreen` en mode traversée), `src/main.ts` (`stepCrossroads`, `ways`, `takeWay`, `openHell`, `exploreWorld`, `revealIsles`, `boot`), `src/ui/ui.ts` (`openExpeditions`, onglet `ways`), `src/sim/war.ts` (`War.wake`), `src/world/world.ts` (`crossroads`, `portalWoken`), `src/hudTheme.css` (styles « le grand choix »), `src/style.css` (styles de la cinématique « Explorer le monde »)
> Tests : `tests/grandChoix.test.ts`, `tests/cinematiqueVoyage.test.ts`
> Voir aussi : [portail-ile.md](portail-ile.md), [monde-carte.md](monde-carte.md) (« Explorer le monde »), [diplomatie.md](diplomatie.md), [expeditions.md](expeditions.md), [ages.md](ages.md), [bac-a-sable.md](bac-a-sable.md), [sauvegarde.md](sauvegarde.md)

## En bref
Deux contenus de fin de partie arrivaient en même temps au début du Médiéval : le portail des Enfers (PvE) et l'archipel (deux îles rivales). Le joueur était perdu. Décision de l'auteur (14 nov. 2026) : à la fin de l'Antiquité, **une seule carte, trois réponses** : « Les Enfers », « Explorer le monde », « Ni l'un ni l'autre ». Le choix est **obligatoire pour passer au Médiéval** (précision de l'auteur : « Ce choix doit être obligatoire pour monter d'âge… la pop-up doit apparaître une fois qu'on a validé toutes les autres steps ») ; « Ni l'un ni l'autre » compte comme un choix. Rien n'est exclusif : la voie non prise (ou les deux) se lance plus tard depuis l'onglet **« Grands choix »** du menu des expéditions (« Voies » jusqu'au 16 nov. 2026 : le nom ne parlait pas à l'auteur). Le jeu **ne guide pas** vers cet onglet : ni message, ni bulle d'aide, ni ligne en tête d'un rayon. Pas de repères ajoutés non plus (noms d'îles, « Aller à… », minicarte).

## Règles du jeu
### La carte
- **Une condition du passage au Médiéval** : la dernière ligne du panneau des âges à l'Antiquité, « le grand choix » (`CHOICE_LABEL`, `Sim.ageProgress`, 0/1). Elle est remplie quand le choix est fait (`World.crossroads`), quand une voie est déjà prise (portail ouvert, archipel accepté) ou quand aucune n'est possible sur la carte (`crossroadsMet`) : personne n'est bloqué. Tant qu'elle manque, `Sim.ready` est faux et « Passer à » ne fait rien.
- La carte s'ouvre **d'elle-même** à l'Antiquité quand **toutes les autres conditions** du Médiéval sont remplies (`crossroadsDue(…, othersDone)`), au calme comme les autres fenêtres automatiques (3 s après l'écran de chargement, `popups` ouverts, sans tutoriel actif), une fois par session (`Game.crossroadsAsked`). Une ancienne partie déjà au Médiéval ou plus, passée sans lui, la voit tout de suite (une fois). Jamais au bac à sable (pas de conditions d'âge).
- **Fermée sans choix** (la croix en haut à droite), elle ne revient pas seule dans la session : un clic sur la condition du panneau des âges, ou sur le conseil du moment (« Pour l'âge suivant : faites le grand choix… (cliquez ici) », `Sim.messageChoice`), la rouvre (`Game.openCrossroads`).
- Deux tuiles côte à côte, le diorama qui déborde en haut de chacune : « Les Enfers » (violette, l'arche du portail) et « Explorer le monde » (dorée, la caravelle) ; puis « Ni l'un ni l'autre » (crème) sur toute la largeur. Une voie impossible sur la carte (pas d'île du portail ; monde qui ne peut plus s'agrandir) est grisée avec sa raison. La note dit « Il faut choisir pour passer au Médiéval. Rien n'est définitif : l'autre voie restera ouverte », sans dire où.
- **Les Enfers** : le portail s'ouvre tout de suite, **sans expédition** (`World.portalWoken`), et le joueur affronte les démons d'emblée (`War.wake` : `pve = 'on'`, `choiceSeen`). Pas de seconde carte « affronter / refermer » : le grand choix la remplace, comme il remplace l'expédition « Le portail de l'autre rive ». La vue va sur l'île (`pveStart` : chapitre `pve` du tutoriel, `commandIsle`).
- **Explorer le monde** : la cinématique (ci-dessous), la carte s'agrandit à l'archipel (`expandWorld`), les deux îles apparaissent.
- **Ni l'un ni l'autre** : rien ne change ; `crossroads` passe à vrai (l'onglet « Grands choix » apparaît).
- Chaque réponse marque `World.crossroads` (sauvegardé) : la carte ne revient plus.

### L'onglet « Grands choix » des expéditions
- Bouton « Grands choix » (boussole) à droite de la barre des expéditions, une fois le grand choix fait (`World.crossroads` ; décision de l'auteur : « Après le grand choix »), et au bac à sable dès le départ, s'il existe une voie sur la carte (`waysTabShown`). Rien ne le signale.
- Une carte par voie (`ui/ways.ts`, styles « l'onglet Grands choix » de `hudTheme.css`), dans l'habillage de la carte du grand choix : parchemin bordé d'or (violet pour les Enfers), diorama en tête (l'arche du portail, la caravelle), nom en Fraunces souligné d'un filet doré, une phrase d'envie, deux pastilles « ce qu'elle ouvre », le pavé d'état en haut à droite, le bouton d'or calé en bas (`.wyFoot`).
- **Sur toute la hauteur de la fenêtre** (demande de l'auteur, 16 nov. 2026 : avant, les cartes n'en prenaient que la moitié haute) : la section est une colonne flexible, les deux cartes une grille d'une rangée qui la remplit (`grid-auto-rows: 1fr`). Dans la carte, le diorama prend la place libre (de 140 à 360 px), le texte et les pastilles suivent, le pied est poussé en bas (`margin-top: auto`) ; marges et tailles de texte suivent la fenêtre (`clamp`). Au téléphone (≤ 760 px), les cartes s'empilent à leur hauteur naturelle (diorama de 150 px) et l'onglet défile. Bandeau : « Deux grands choix, à faire quand vous voulez : l'un, l'autre ou les deux. »
- Trois états (`wayBadge`) :
  - **Disponible** : pavé doré et bouton « Ouvrir le portail » (« Rouvrir le portail » s'il a été refermé) ou « Explorer le monde ». C'est la voie non prise, ou les deux après « Ni l'un ni l'autre ».
  - **Choix fait** : pavé vert, une phrase dit ce qui est là, pas de bouton.
  - **Pas sur cette carte** : pas d'île du portail, ou monde qui ne peut plus s'agrandir. Carte grisée, pas de bouton.
- Le bouton ferme la fenêtre et ouvre la carte de cette seule voie pour confirmer (`WorldChoice.show(way)` : la voie et « Pas maintenant »). Le portail refermé (état `ask` de la voie) ouvre plutôt la carte du portail (« Affronter les démons » / « Garder le portail fermé ») ; ouvert sans choix (ancienne partie, bac à sable), c'est la carte de la voie des Enfers, qui passe `pve` à `on`.
- Au téléphone (≤ 640 px), les deux cartes s'empilent.

### La cinématique « Explorer le monde » : un film, puis le survol en direct
Elle fait office de chargement. Décision de l'auteur (15 nov. 2026), après une partie complète où la première version saccadait : « une vidéo enregistrée + un survol en direct ». L'habillage est celui de la cinématique de fin du volet militaire : bandes noires, bandeaux dorés, fondus, « Passer ». La partition est dans `voyageCine.ts` (testée), le film dans `ui/voyage.ts`, le survol dans `voyageStage.ts`.

1. **Le film** (`VOY_FILM`, 20 s, la même vidéo pour tous) : une caravelle en pleine mer, sans côte ni île du joueur, filmée de trois quarts arrière, puis de côté, puis de plus haut. Le bandeau « Un navire prend la mer · Cap sur l'inconnu » paraît, puis la brume monte de 15,5 à 19,5 s (« La brume se lève… »).
   - Il part au clic sur « Explorer le monde » (`LoadingScreen(app, true)` → `VoyageFilm`). La vidéo ne se télécharge qu'à ce moment-là (`<video>` créé au clic, rien ne la précharge avant).
   - Une fois qu'il joue (ou au plus 2 s après le clic, si la vidéo tarde), plus 1,2 s de film, la partie est sauvegardée, agrandie (`expandWorld`) puis rechargée.
   - Juste avant le rechargement, `VoyageFilm.mark` note où en est le film (`VOY_KEY` dans `sessionStorage` : temps, heure, passé ou non). Au rechargement, `boot` pose le même écran ; le film reprend au temps noté plus le temps écoulé (`resumeAt`). Pendant le rechargement, le fond de la page reste couleur de brume (petit script dans `index.html`).
   - Il couvre le chargement des modèles, la construction du monde agrandi, la préparation des shaders et les premières images. **Une vidéo joue même quand le jeu calcule** (décodage et affichage hors du fil principal), contrairement à une scène 3D ou à une animation CSS sur `left`.
   - Fini avant que la partie ne soit prête, il s'efface sur la brume peinte (`VOYAGE_PLATE` : navire en ombre qui tangue, nappes qui passent, animées en transformations seules) avec le bandeau « Au-delà de la brume… · le monde s'agrandit ». Le filet doré sous les bandes montre l'avancée.
   - Prêt avant la fin du film, l'écran attend qu'il finisse (`LoadingScreen.done` : classe `ready`, puis `whenDone`).
2. **Le survol en direct** (`VOY_ACT2`, ≈ 30 s), une fois la partie prête **et** le film fini. Il est lancé dès la première image de la partie agrandie (`Game.voyage`) et attend sous l'écran de la traversée. Partie prête (`#loadScreen.ready`), il montre chaque plan une image sous la brume (`PRIME` : l'île d'Orient, l'île d'Asie, les flottes, avec les navires des ports) pour que modèles, ombres et impostures partent au GPU pendant le film plutôt qu'en plein survol. L'écran parti, la brume se dissipe (`VOY_LIFT` = 2,6 s), puis un fondu au noir (`VOY_DIP`) sépare chaque plan :
   - **l'horizon** (5 s) : une caravelle part du bord de l'île principale, cap sur les deux îles ; la vue, au ras de l'eau derrière elle, recule et s'élève (« La mer s'ouvre · et l'horizon recule ») ;
   - **l'île d'Orient** (7 s) : la ville vue de la mer, en tournant de sa mosquée vers son port, d'où sortent deux navires (« Une île de sable et de palmiers · Sa mosquée, son port, tout un peuple ») ;
   - **l'île d'Asie** (7 s) : de même, sa pagode et ses jonques ;
   - **les flottes** (7 s) : au milieu du bras de mer (`navalSites().battle`), trois navires de chaque peuple s'avancent les uns vers les autres (« Deux peuples, deux flottes · Une vieille rivalité les oppose ») ;
   - **le retour** (4,5 s) : la vue revient au village et s'y pose, sans bandeau.

   À la fin, l'interface revient et la carte du choix de l'allié s'ouvre (`onIslesRevealed`, voir [diplomatie.md](diplomatie.md)). `VOY_CONTACT` (l'ancienne bannière du premier contact) n'est plus affichée.

- **La vidéo** : `public/voyage/traversee.webm` (VP9, ≈ 1,9 Mo) et `traversee.mp4` (H.264 de secours, ≈ 1,7 Mo), 1280 × 720, 30 images/s, sans son. C'est bien sous la limite de taille par fichier des ressources statiques de Cloudflare Workers (25 Mio). Une WebM illisible bascule sur le MP4 au même moment ; illisible aussi, ou introuvable, la brume seule, rien ne bloque.
- **Fabriquer la vidéo** (pour la refaire) :
  - dans une partie agrandie, en build de production, qualité « Élevée », fenêtre de 1280 × 720 ;
  - placer la caravelle (celle du survol) en pleine mer, loin de toute terre (une case dont la terre la plus proche est à plus de 80 cases), cap à l'ouest vers le bord de la carte ;
  - poser la caméra à la main pour chaque image (`cam.jump`), faire avancer le jeu d'une image (`advance` puis `renderer_render`), puis `canvas.toDataURL('image/jpeg')` envoyé à un petit serveur local qui écrit `0000.jpg` … `0599.jpg` (dans une page cachée, `toBlob` ne rend jamais la main) ;
  - encoder avec ffmpeg (chemin : voir [audio.md](audio.md)), filtre vidéo `fade=in:st=0:d=1.2:color=0xdfe7e8,fade=out:st=15.5:d=4:color=0xdfe7e8,scale=out_range=tv,format=yuv420p` :
    - WebM : `-c:v libvpx-vp9 -profile:v 0 -pix_fmt yuv420p -color_range tv -b:v 0 -crf 31 -row-mt 1 -deadline good -cpu-used 2 -g 60 -an` ;
    - MP4 : `-c:v libx264 -pix_fmt yuv420p -color_range tv -crf 25 -preset slow -profile:v high -movflags +faststart -an`.
  - **Piège** : des JPEG en entrée donnent une plage de couleurs « pleine » ; la WebM VP9 qui en sort ne se décode pas dans Chromium (`PIPELINE_ERROR_DECODE`). D'où `scale=out_range=tv` et `-color_range tv`.
- **Musique** : le morceau de l'exploration (`medieval-exploration`, scène `voyage`, `SCENE_TRACKS` dans `audio.ts`), au volume de la musique. `main.ts` le choisit tant que le film (`#loadScreen.voyage`) ou le survol (`voyageStage.playing`) est là. Après le rechargement, le navigateur ne laisse le son repartir qu'au premier geste du joueur.
- **Passer, partout** : un clic n'importe où, Échap ou Espace.
  - Pendant le film, avant ou après le rechargement : il s'arrête sur la brume, et le survol ne se jouera pas (`skip` noté dans `VOY_KEY`). Le chargement, lui, va au bout.
  - Pendant le survol : tout de suite au village.
- **Une seule fois** : `world.reveal` (sauvegardé) demande le survol. Il passe à faux quand le survol commence, et la sauvegarde qui suit la fin ne le porte plus : une partie rechargée ensuite ne rejoue rien. Une partie rechargée autrement pendant le survol (onglet fermé) le rejoue une fois, au calme, ouvert par un fondu au noir. La note du film est effacée à la fin du survol, et à tout démarrage qui n'est pas une traversée.
- **Pendant la cinématique, pas de visiteurs de la faune** (`Fauna.quiet`) : leur recensement près de la vue coûtait 200 à 300 ms toutes les 3 s au-dessus de la mer.
- **Les Enfers, ni l'un ni l'autre** : pas de plan de transition. « Les Enfers » mène déjà la vue sur l'île du portail (`commandIsle`) ; « Ni l'un ni l'autre » ne change rien à l'écran.

#### Mesure (15 nov. 2026, build de production, partie neuve puis agrandie)
Les images ont été jouées une à une, temps de calcul et de rendu de chaque image.
- **L'ancien acte I en direct** (192 cases) : 23 ms par image en moyenne, mais des rendus de 50 à 100 ms à répétition, la vue basse au-dessus de la côte et des forêts.
- **Le chargement de la partie agrandie** : de longs blocs sur le fil principal, qui figeaient l'ancienne brume animée en CSS (`left`, `background-position`) :
  - construction du monde 3,9 s ;
  - première image 1,7 s ;
  - shaders 0,6 s, premiers usages 0,45 s ;
  - premières images (`warmUp`) 4 s.
- **L'ancien acte II** : 18 à 20 ms par image en moyenne, mais un à-coup de 200 à 270 ms toutes les 3 s. Il venait de `Fauna.scout`, qui appelait des dauphins près de la vue au-dessus de la mer.
- **Après** : le film joue pendant tout le chargement. Le survol, préparé sous la brume, tourne à 26 ms par image en moyenne, sans aucune image au-dessus de 60 ms. Avant la préparation des navires des ports, la première vue des jonques coûtait une image de 580 ms.

## Fonctionnement dans le code
- **États des voies** (`crossroads.ts`) : `hellWay(w, pve)` = `none` (pas d'île), `open` (portail fermé, ou ouvert sans choix : `pve` `ask`), `ask` (ouvert puis refermé : `pve` `off`), `taken` (`pve === 'on'`). `worldWay(w, canExplore)` = `taken` (`archipelagoOn`), `open` (`canExpand` : continent de 192, version 3), `none`. `Game.ways()` les calcule.
- **`Game.stepCrossroads`** (chaque image, dans `stepWar`) : d'abord la cinématique en attente (`world.reveal`, `revealReady`), puis, tant que `crossroads` est faux, `crossroadsSettled` (une voie déjà prise ou en suspens, ou aucune possible) marque `crossroads` sans rien montrer ; sinon, au calme et si elle ne s'est pas déjà ouverte dans la session, `crossroadsDue` ouvre la carte (`othersDone` : toutes les lignes de `ageProgress` sauf `CHOICE_LABEL` remplies).
- **La condition** (`Sim.ageProgress`, passage vers `CROSSROADS_AGE`) : `crossroadsMet(w, hellWay(w, 'ask'), worldWay(w, canExpand(…)))` (la simulation ne connaît pas `War.pve`, inutile ici : `ask` et `taken` remplissent pareil). Le panneau des âges la reconnaît à son libellé (`reqOf` → `choice`).
- **`Game.openHell`** : `crossroads = true`, puis `portalWoken = true` et `War.wake()` si le portail était fermé (sinon `acceptPve`), `pveStart`, sauvegarde. `War.wake` efface `legacyInv` : une ancienne sauvegarde sans état d'invasion, au Médiéval, l'aurait crue faite (`readLegacyInvasion` : âge ≥ 2) ; `acceptPve` efface `legacyPve` (sans quoi `readLegacyPve` récrirait le choix).
- **`Game.exploreWorld`** : bloque les autres fenêtres (`revealing`), pose l'écran de la traversée (le film part), attend qu'il joue, puis `buildSave` → `expandWorld` → `exploredAt` → `saveSlot` → `film.mark` → rechargement. `Game.voyage` est posé par `boot` (`voyage && world.reveal`) ; `revealIsles` lance `voyageStage.play` (brume si `voyage`), et sa fin rend la main (note du film effacée, `revealing` faux, `onIslesRevealed`, sauvegarde). `VoyageStage.update` est appelé à chaque image avec le temps réel (plafonné à 0,1 s) ; ses hôtes `loading`, `ready`, `skipped` lisent `#loadScreen`, `#loadScreen.ready` et la note du film.
- **Bac à sable** : le portail s'éveille seul à l'Antiquité, sans carte ni invasion (voir [bac-a-sable.md](bac-a-sable.md)) ; pas de grand choix ; l'onglet « Grands choix » est là dès le départ (« Les Enfers » pour affronter les démons, « Explorer le monde »).

## Liens avec les autres systèmes
- [portail-ile.md](portail-ile.md) : le portail ouvert par le grand choix ; la carte du portail ne s'ouvre plus d'elle-même, elle ne sert qu'à rouvrir un portail refermé.
- [monde-carte.md](monde-carte.md) : `expandWorld`, `canExpand`, `archipelagoOn`.
- [expeditions.md](expeditions.md) : l'expédition `portal` n'est plus proposée ; l'onglet « Grands choix ».
- [ages.md](ages.md) : plus rien du portail pour sortir de l'Antiquité.

## Pièges et invariants
- **Anciennes sauvegardes** : sans `crossroads`, la partie n'a pas choisi. Une partie encore à l'Antiquité reçoit la condition (remplie d'office si son portail est déjà ouvert). Un portail dont on affronte les démons (`on`) ou qu'on a refermé (`off`), ou un archipel accepté, marque le choix fait au premier pas (rien ne change). Un portail ouvert en attente (`ask` : l'expédition réussie sans réponse à l'ancienne carte du portail) tombe dans le grand choix ; « Les Enfers » y passe `pve` à `on`. Une partie au Médiéval ou plus, sans l'un ni l'autre (même restée sur son île à l'ancienne carte « Explorer le monde », `explore: 'no'`), voit la carte une fois. `World.explore` n'est plus lu, mais toujours relu et réécrit.
- Une ancienne partie qui a l'expédition du portail **en route** la garde visible (`Expeditions.list`) jusqu'au retour ; réussie, elle ouvre le portail (`exp.done`), sans carte : il tombe dans le grand choix (ou l'onglet « Grands choix » si le choix est déjà fait).
- Le survol se tient sur la brume tant que `#loadScreen` existe (`VoyageHost.loading`) : garder l'id `loadScreen` à l'écran de la traversée (toutes les gardes de fenêtres le lisent aussi). Son voile de brume (`#voyCine .vc-mist`, sous `#loadScreen`) a la couleur de la fin du film et de la brume peinte : l'écran s'efface sur lui sans coupure.
- Ne pas remettre de scène 3D ni d'animation CSS hors transformations pendant le chargement : le fil principal y est pris des secondes entières (voir la mesure).
- `body.cinematic` cache les bannières : les bandeaux de la cinématique sont les siens (`.kc-cap`), pas `ui.banner`. À la fin, la classe n'est retirée que si la cinématique du royaume ne la tient pas ; la carte du choix de l'allié s'ouvre après (voir [diplomatie.md](diplomatie.md)).
- Le jeu ne guide pas vers l'onglet : ne pas ajouter de message, de bulle ou de ligne de rayon qui y mène (décision de l'auteur).

## Pour modifier
- **Changer l'âge du choix** : `CROSSROADS_AGE` (la condition, `crossroadsDue`).
- **Ajouter une voie** : un état dans `crossroads.ts`, une tuile dans `WorldChoice.grand`, une carte dans `waysHtml`, une branche dans `takeWay` ; tests dans `grandChoix.test.ts`.
- **Retoucher la cinématique** : bandeaux du film, plans, durées et fondus du survol dans `voyageCine.ts` (tests `cinematiqueVoyage.test.ts`) ; caméra et navires de chaque plan dans `VoyageStage.place` ; la brume peinte dans `VOYAGE_PLATE` et les styles de `style.css`. Changer le film : le refaire comme dit plus haut, et ajuster `VOY_FILM` (durée, moments des bandeaux).
