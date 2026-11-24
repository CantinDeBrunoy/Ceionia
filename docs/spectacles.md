# Spectacles : les gestes des bâtiments

> Fichiers : `src/sim/shows.ts` (règles : quel geste où, délai, bien-être, déroulé d'un match), `src/shows.ts` (`ShowDirector` : lancer, spectateurs, tableau d'affichage, récompense), `src/render/shows/common.ts` (couleurs des camps, places des tribunes, foule qui s'anime : `StandsFx`), `src/render/shows/football.ts` (`MatchView`), `src/render/shows/race.ts` (`RaceView`), `src/ui/ui.ts` (bouton de la fiche, `renderSelection`), `src/hudTheme.css` (`.showAct`, `.showBoard`), `src/audio/audio.ts` (`sfxWhistle`, `sfxKick`, `sfxCrowd`), `src/main.ts` (création, `shows.update(gdt)`)
> Tests : `tests/spectacles.test.ts`
> Voir aussi : [chemin-de-fer.md](chemin-de-fer.md) (le modèle : on agit sur la fiche, il se passe quelque chose), [interface.md](interface.md), [habitants.md](habitants.md), [besoins-population.md](besoins-population.md), [batiments-catalogue.md](batiments-catalogue.md), [sauvegarde.md](sauvegarde.md)

## En bref
Certains bâtiments ont un geste sur leur fiche, comme la gare a « Nouvelle ligne » : au stade de football, « Lancer un match » ; au stade d'athlétisme, « Organiser une course ». Des habitants sortent de chez eux et marchent jusqu'au stade, deux équipes entrent sur la pelouse et jouent un vrai petit match animé, les tribunes exultent à chaque but, un tableau d'affichage suit le score au-dessus du stade. À la fin, une bannière dit le résultat et la récompense (du bien-être pour un temps, parfois de nouveaux habitants, de l'or), et le geste attend son délai avant de pouvoir se refaire. Un seul spectacle à la fois au village.

Retour de l'auteur et des joueurs (24 nov. 2026) : des bâtiments « qui ont une vraie utilité, pas seulement des chiffres ». Le recensement des bâtiments qui s'y prêtent (geste, ce qu'on voit, récompense, délai) est dans `.claude/batiments-utilite.md`.

## Règles du jeu
**Les gestes** (`SHOWS`, une entrée par geste) :

| Geste | Bâtiment | Délai | Bien-être | Durée | Spectateurs | Nouveaux habitants |
|---|---|---|---|---|---|---|
| Lancer un match (`match`) | stade de football (`football`), dès l'âge industriel | 1 jour | bien-être du stade à son âge (6, 8, 10) ×1,5 victoire, ×1 nul, ×0,6 défaite | 2 jours | 12 au plus | 2 si le village gagne |
| Organiser une course (`race`) | stade d'athlétisme (`stadium`), dès l'âge industriel | 1 jour | 0,8 × bien-être du stade (8, 12, 15), ×2 si le record du village tombe | 1,5 jour | 10 au plus | aucun |

- **Délai** (`cooldown`, en jours de jeu, `GameTime.dayLen`) : compté par geste pour tout le village (`ShowState.next`, heure de `exp.clock`), posé dès le lancement. Bâtir deux stades ne fait pas deux matchs de suite.
- **Ce qui empêche** (`showBlock`, dans l'ordre) : un autre spectacle en cours, le joueur hors du village (Enfers, commandement de l'île), le délai (« De nouveau possible dans 5 h », « dans 1 j 6 h », `waitLabel`), une forte pluie pour un sport (`dry`, `env.rainK > 0.6`, comme l'abri des habitants). La fiche le dit sous le bouton, grisé.
- **Bien-être** (`showJoyFor`) : la part `joyK` du bien-être du bâtiment à son âge, multipliée par le résultat, au moins 2. Il compte `joyDays` jours (`ShowState.boost`), ajouté à la capacité de bien-être dans `Sim.evaluate` (`showJoy`), avec sa ligne « Fêtes et spectacles (en cours) » dans la fiche du bien-être. Refaire le geste **remplace** son bien-être en cours, il ne s'additionne pas.
- **Nouveaux habitants** (`newcomers`) : seulement s'il reste de la place, en gardant une place libre (`showRoom` : `cap > pop` doit rester vrai, sinon le village serait « plein » pour rien). Ajoutés d'un coup à `Sim.pop`.
- **Or** : la recette d'un match, `2 + spectateurs / 3`, seulement si l'archipel est accepté (`archipelagoOn` : sans lui, l'or ne sert à rien et n'est pas affiché).
- **Spectateurs** : au plus `fans` passants, parmi ceux qui sont libres (`Agents.available()`, `recruit`). Ils marchent de chez eux jusqu'à l'entrée du bâtiment (devant sa façade, `FRONT[b.rot]`), y entrent (cachés) à mesure qu'ils arrivent, au plus tard au bout de `GATHER_MAX = 14` s ; à la fin, ils ressortent par l'entrée et rentrent chez eux (`dismiss`). Pendant le spectacle, ils ne sont pas libres pour une expédition.

**Le match** (`MatchView`, `planMatch`) :
- Le déroulé est tiré d'avance (`planMatch`, graine tirée de l'horloge et du bâtiment) : 0 à 5 buts (moyenne 2,3), à 6 s au moins l'un de l'autre, entre la 6e seconde et 6 s avant la fin, le village marque 55 % des buts. Le score final est donc connu dès le coup d'envoi ; l'animation y conduit.
- Durée de jeu `MATCH_TIME = 70` s de jeu (le chrono affiché va de 0 à 90 minutes), plus l'entrée des équipes (9 s), la mi-temps (4 s), la fête de chaque but (4,5 s) et la fin (7 s) : un peu plus de 1 min 30 à vitesse ×1. Tout avance au temps de jeu (`gdt`) : rien ne bouge en pause, tout va plus vite à ×3.
- Deux équipes de cinq (un gardien, deux défenseurs, un milieu, un avant), l'arbitre en noir. Maillots du village aux couleurs de son blason (un peu éclaircies), visiteurs dans la couleur vive qui s'en distingue le mieux (`teamColors`) ; gardiens en vert et orange. Les visiteurs portent un nom tiré d'une liste (« Racing des Collines », « Union du Fleuve »…), le village celui de l'île (`World.isleName`).
- Le jeu : le porteur pousse le ballon vers le but adverse en ondulant ; il passe à un coéquipier (plutôt devant lui, passe lobée si elle est longue), ou tire s'il est à portée (le gardien plonge du bon côté et capte) ; le défenseur le plus proche le presse et lui prend parfois le ballon ; les autres tiennent leur poste, poussé vers le ballon ; le gardien glisse sur sa ligne. Un but prévu : 2,4 s avant, l'équipe qui doit marquer reprend le ballon (le plus proche des siens), file au but et frappe à 0,55 s de l'heure ; le gardien plonge du mauvais côté. Pas de tacle ni de tir ordinaire dans les 5 s qui précèdent un but.
- Un but : le buteur court vers le poteau de corner, bras levés, les siens le rejoignent, les autres reviennent à leur poste ; la tribune du camp se lève (écharpes, fumigènes, confettis), message « ⚽ But pour … ». Remise en jeu par l'équipe qui a encaissé.
- La fin : les vainqueurs se rassemblent au rond central et sautent, les autres saluent ; bannière « ⚽ Victoire 2 – 1 ! » et la récompense.

**La course** (`RaceView`, `planRace`) :
- Un tour de piste, six coureurs, un par couloir, en débardeur de couleur vive (rouge, bleu, jaune, vert, violet, orange) et short noir, chacun avec un prénom du village (`firstName`, selon l'âge). Les temps sont tirés d'avance (`planRace` : de 44 à 52 s au centième) ; le chrono affiché va à l'échelle du spectacle (`VIS = 0,45` : une course de 47 s se court en 21 s de jeu).
- Les coureurs entrent par la tribune et vont à leur couloir, **départs décalés** : chaque couloir est un ovale plus grand (`ellipse`, petit couloir intérieur et largeur de couloir de `TRACKS`, recopiés de `stadiumBig` et du plan réduit `stadium` de models.ts), il part d'autant plus loin devant que son tour est plus long (`at`, longueurs mesurées une fois, `measure`). Tous finissent à la ligne d'arrivée (la ligne blanche du modèle, `line`).
- « À vos marques » : accroupis (pose `gather`), le starter en blanc lève le pistolet ; coup de feu (`sfxClash('shot')`) et sa fumée, la foule se lève. En course, chacun avance à sa part de course (`progress`) : un départ en accélération, de petits écarts qui se font et se défont (des dépassements), et il passe la ligne à son temps exact : l'ordre d'arrivée est celui des temps. La foule s'échauffe dans la dernière ligne droite ; à l'arrivée du premier, gerbe de confettis, fumigènes et une trentaine de flashs de photographes dans la tribune (quelques-uns pour chacun des suivants).
- Après la ligne, ils ralentissent (`AFTER` = 4 s), puis le podium paraît au milieu de la pelouse : trois marches blanches à liseré or, argent, bronze ; les trois premiers y montent, médaille au cou, le vainqueur bras levés ; les autres applaudissent à côté (`PODIUM` = 9 s).
- Le **record du village** (`ShowState.record`, sauvegardé) : le meilleur temps de la course. La première course en établit un. Un record battu double le bien-être ; la bannière dit « 🏃 Record du village : Yanis en 44,18 s ! » (et l'ancien record), sinon « Léa gagne en 45,02 s » et le record à battre.
- Le tableau : « Les coureurs entrent », « À vos marques… », le chrono et le nombre d'arrivés, puis les trois premiers, leur couleur et leur temps. Les temps s'écrivent avec la virgule en français, le point en anglais (`tr(',')`).
- Sur le plan réduit d'un ancien stade (2 × 2), la course a sa propre piste (`TRACKS.small`), sans échelle.

**Le tableau d'affichage** (`.showBoard`) : au-dessus du stade, suivi à l’écran, toujours en dessous des barres du haut (`HUD_BARS`, leur bas relu toutes les 60 images) ; les deux camps (pastille de couleur, nom), le score, la minute (ou « Entrée des équipes », « Mi-temps », « Fin du match »). Caché quand le stade sort de l'écran.

**La foule qui s'anime** (`StandsFx`) : par-dessus la foule du modèle (sa ola), une écharpe aux couleurs du camp à chaque place des tribunes (`footSpots` : le village côté -x, les visiteurs côté +x), qui se balance au calme et se lève haut quand le camp exulte (`heat`, qui retombe de 0,22 par seconde) ; aux grands moments (`cheer` à 0,9 et plus), 8 fumigènes de sa couleur et 160 confettis.

**La fiche** : sous les lignes de la gare et avant les améliorations, le bouton doré du geste (`data-act="show"`), grisé avec la raison en italique quand il ne peut pas se lancer ; pendant le spectacle, « Voir le spectacle » (la vue y retourne) et « Match en cours » en vert. Le lancement mène la vue au stade (`goTo`, distance 6,5).

## Fonctionnement dans le code
- `ShowDirector.launch(b)` : vérifie `blocked`, crée la scène (`stage`) dans le groupe du bâtiment (`BuildingView.entries.get(id).group` : le repère du modèle, sa rotation comprise ; échelle 0,64 pour un plan réduit sur 2 × 2, `showScale`), enrôle et envoie les spectateurs, pose le délai (`showStarted`), mène la vue.
- `ShowDirector.update(gdt)` (appelé par `Game.frame` après la fête des expéditions) : cache les spectateurs arrivés, fait avancer la scène, place le tableau ; à `view.done`, `finish` (récompense, bannière) puis `stop`. Un bâtiment démoli pendant le spectacle : `stop` sans récompense.
- Une scène (`ShowView`) : `group`, `done`, `update(dt)`, `dispose()`. Le directeur la lit par un `Act` : `board()` (le HTML du tableau) et `result()` (le facteur de bien-être, le titre, si de nouveaux habitants viennent).
- Joueurs : `makeFolk` (cinq maillages chacun), plus un maillot (`dress` : plastron plus large que les habits de l'époque, qu'il couvre, short, numéro), animés par `folkStep` (`run`, `walk`, `idle`, `cheer`) ; le plongeon du gardien penche tout le modèle (`rotation.z`). 11 habitants articulés de plus, seulement pendant le match.
- Le modèle du stade de football n'a plus de joueurs figés sur la pelouse, ni le stade d'athlétisme de coureurs figés dans ses couloirs (ils se seraient mêlés aux joueurs animés) : la pelouse et la piste sont vides entre deux spectacles (les sauteurs restent).

## Liens avec les autres systèmes
- Habitants : `Agents.recruit`, `partyGo`, `memberDone`, `partyHide`, `partyPlace`, `dismiss` ([habitants.md](habitants.md)).
- Besoins : `showJoy` dans `Sim.evaluate` et `needDetail('joy')` ([besoins-population.md](besoins-population.md)).
- Sauvegarde : champ `shows` du monde (`next`, `boost`, `record`), écrit seulement s'il n'est pas vide, relu par `readShowState` (absent des anciennes parties : rien en cours) ([sauvegarde.md](sauvegarde.md)).
- Or et archipel : [diplomatie.md](diplomatie.md).

## Pièges et invariants
- Un spectacle en cours n'est **pas** sauvegardé : recharger au milieu d'un match l'efface, le délai reste (posé au lancement). Les spectateurs sont recréés au chargement comme tous les passants.
- Le score affiché vient des buts **joués** (`MatchView.score`), le déroulé (`plan.score`) en est la prévision : le test `tests/spectacles.test.ts` vérifie qu'ils sont égaux à la fin, pour plusieurs graines. En touchant au jeu (`play`), garder le but forcé (`forced`) et la règle « pas de tacle ni de tir dans les 5 s qui précèdent un but ».
- Le groupe d'un bâtiment peut être refait (passage d'âge, neige de l'hiver…) : `update` raccroche la scène au groupe du moment à chaque image (sinon elle disparaît en plein spectacle, comme les bêtes du zoo avant `ZooView`).
- La mi-temps ne tombe jamais dans les 3 s qui précèdent un but prévu (elle attend).
- Les couleurs des maillots sont de vraies couleurs (pas les sentinelles du blason, `teamPaint.ts`) : il faut lire `World.blason`. Le tableau d'affichage les montre aussi.
- `StandsFx` suppose la foule du modèle : ses places (`footSpots`) recopient les rayons et hauteurs des gradins de `stadiumFoot` (models.ts). Changer les gradins, c'est changer `footSpots`.
- Les textes de `SHOWS` sont localisés en bas de `sim/shows.ts` (`localize`), les autres passent par `tr` ; l'anglais est dans `src/i18n/en/misc.ts`. Pas de point-virgule dans les textes affichés.

## Pour modifier
- **Ajouter un geste** : une entrée de `SHOWS` (et son `ShowId`), une scène dans `src/render/shows/` (`ShowView`), sa branche dans `ShowDirector.stage` (tableau et résultat), l'anglais, une ligne au tableau ci-dessus. Le bouton de la fiche vient tout seul (`showFor`).
- **Changer un délai, une récompense** : `cooldown`, `joyK`, `joyDays`, `fans`, `newcomers` dans `SHOWS` ; le facteur du match dans `matchK`.
- **Changer la longueur d'un match** : `MATCH_TIME`, et les temps `ENTER`, `HALF`, `CELEB`, `END` de `football.ts`.
- **Changer la piste** (le modèle du stade d'athlétisme) : `TRACKS` de `race.ts` (centre, demi-axes du couloir intérieur, largeur d'un couloir, ligne d'arrivée, place du podium) et `trackSpots` (la tribune).
