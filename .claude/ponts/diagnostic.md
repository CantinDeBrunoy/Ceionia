# Ponts sur les petits cours d'eau : diagnostic (avant de coder)

Captures « avant » : `avant-*.jpg` dans ce dossier (ruisseau encaissé droit à chaque âge, jonctions près du pont, rivière large, route en escalier, torrent, hiver de nuit).

## Cause commune

1. **La hauteur du tablier est tirée du niveau de l'eau, pas de la chaussée des rives.** `World.bridgeY` = niveau d'eau + 0,24 quelle que soit la rive. Sur une rivière large et plate (rives à 0,1) ça tombe juste ; sur un petit ruisseau encaissé (rives à 0,8 … 1,4, fond à −0,8) le tablier voulu est très en dessous des rives, et `deckProfile` le remonte alors jusqu'au **point de sol le plus haut de la portée** : le tablier se cale sur la rive la plus haute, surplombe l'autre rive de 0,5, et l'on rattrape par des rampes raides et des culées massives (captures 01 à 05). Les habitants et véhicules, eux, marchent à `max(bridgeY, sol)` : une autre hauteur que le tablier dessiné.
2. **Trois générateurs pour le même objet**, chacun avec sa règle de hauteur, de largeur, d'extrémités et de matériaux : `smoothBridge` (chaîne simple), `bridge()` par case (dès qu'une jonction touche une case d'eau : boîtes posées à plat, un seul garde-corps, rampes qui pendent, captures 06, 10, 13) et `Streams.buildBridges` (torrents : caisson de bois 1 × 0,5 posé à la hauteur du point le plus haut alentour, toujours en bois, même sur du bitume, captures 09 et 12).
3. **L'axe du pont est le chapelet des centres de cases**, lissé : une route en escalier donne un tablier qui serpente (captures 08 et 11), et le pont s'étend jusqu'à 4 cases sèches entre deux bras : un tablier sur l'herbe.

## Après

Captures `apres-*.jpg` (mêmes scènes, mêmes angles ; la carte n'est pas la même, la graine change à chaque partie : le
ruisseau encaissé et la rivière plate sont sculptés à l'identique dans le relief pour comparer). Le tablier va de la chaussée
d'une rive à celle de l'autre (corde tendue au-dessus de l'eau et du sol), sans marche ni culée massive ; une route en
escalier donne une diagonale droite ; les jonctions sur l'eau deviennent des plateaux carrés d'où partent les tronçons ; le
torrent plonge sous la route, qui reçoit une petite dalle du style de l'âge. Reste imparfait : une grille de routes posée sur
l'eau le long d'un ruisseau (capture 06/10) fait une plateforme dense de garde-corps, cohérente mais chargée.

## Retour de l'utilisateur (v2) : « deux ponts sur la petite rivière, et ils coupent l'eau »

Captures `v2-avant-*` : le « petit ruisseau sinueux » est un torrent (`streams.ts`, ruban drapé sur le relief). Chaque case de
chemin qu'il touchait recevait **sa propre dalle** le long de sa ligne de chemin (deux groupes de garde-corps décalés), et le
ruban **plongeait sous la chaussée** (l'eau semblait coupée). Remède : les cases de torrent deviennent des cases d'eau comme
les autres (`World.torrents`, posées par `Streams`), donc UN franchissement par groupe (profil, garde-corps continus, piles),
avec un « niveau d'eau » = sol + 0,05 : le tablier passe à 0,29 au-dessus du sol et l'on voit l'eau couler dessous ; le
ruban n'est plus enfoncé. Deux bras d'un même ruisseau à quatre cases au plus le long de la route ne font plus qu'un pont au
tablier continu (`MAX_DRY_GAP` 2 → 4). Captures `v2-apres-*` : ruisseau sinueux à deux bras (un seul pont, l'eau passe deux
fois dessous), torrent le long du chemin, chemin qui croise un torrent (vue à ras de l'eau : le ruban continu sous le tablier).

## Remède

Un seul module (`src/world/crossings.ts`) détecte chaque franchissement une fois (cases d'eau portées, tronçons entre rives et nœuds, axe simplifié par les milieux de bords) et calcule **un profil unique** : la corde entre les deux pieds de rampe (hauteur de la chaussée des rives), relevée juste ce qu'il faut au-dessus de l'eau (+0,24) et jamais sous le sol. `World.surfaceAt`, `bridgeY` et `passPoint` lisent ce même profil (habitants et véhicules sur le tablier). `roads.ts` ne fait plus que dessiner ce profil, avec un style par âge ; les torrents reçoivent une dalle ou une passerelle du même style, et le torrent passe sous la route.
